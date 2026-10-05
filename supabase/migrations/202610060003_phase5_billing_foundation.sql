-- Extend the existing, intentionally separate VYRO and gym-member ledgers.

-- Gym member payments retain the original row and gain an optional, tenant-matched
-- membership link plus a recorded payment date and provider extension fields.
alter table public.member_memberships
  add constraint member_memberships_id_gym_member_key unique (id, gym_id, member_id);
alter table public.member_payments add column membership_id uuid;
alter table public.member_payments add column payment_date timestamptz;
update public.member_payments set payment_date = paid_at where payment_date is null;
alter table public.member_payments alter column payment_date set default now();
alter table public.member_payments alter column payment_date set not null;
alter table public.member_payments add column updated_at timestamptz not null default now();
alter table public.member_payments add column provider_name text;
alter table public.member_payments add column provider_reference text;
alter table public.member_payments add constraint member_payments_membership_member_gym_fk
  foreign key (membership_id, gym_id, member_id)
  references public.member_memberships(id, gym_id, member_id) on delete restrict;
alter table public.member_payments drop constraint member_payments_status_check;
update public.member_payments set status = case status
  when 'paid' then 'completed'
  when 'void' then 'cancelled'
  else status
end;
alter table public.member_payments alter column status set default 'pending';
alter table public.member_payments add constraint member_payments_status_check
  check (status in ('pending', 'completed', 'failed', 'refunded', 'cancelled'));
alter table public.member_payments add constraint member_payments_currency_check
  check (currency ~ '^[A-Z]{3}$');
create index member_payments_gym_date_idx on public.member_payments(gym_id, payment_date desc);
create index member_payments_gym_status_date_idx on public.member_payments(gym_id, status, payment_date desc);
create index member_payments_gym_member_membership_idx
  on public.member_payments(gym_id, member_id, membership_id, payment_date desc);

-- VYRO subscriptions remain a separate platform-owner-only billing domain.
alter table public.platform_subscriptions add column billing_period text not null default 'monthly'
  check (billing_period in ('monthly', 'quarterly', 'yearly', 'custom'));
alter table public.platform_subscriptions add column provider_name text;
alter table public.platform_subscriptions add column provider_customer_reference text;
alter table public.platform_subscriptions add column provider_subscription_reference text;
alter table public.platform_subscriptions drop constraint platform_subscriptions_status_check;
alter table public.platform_subscriptions add constraint platform_subscriptions_status_check
  check (status in ('trial', 'active', 'past_due', 'expired', 'suspended', 'cancelled'));
create index platform_subscriptions_status_renewal_idx
  on public.platform_subscriptions(status, expires_on, gym_id);

alter table public.platform_subscription_payments add column payment_date timestamptz;
update public.platform_subscription_payments set payment_date = paid_at where payment_date is null;
alter table public.platform_subscription_payments alter column payment_date set default now();
alter table public.platform_subscription_payments alter column payment_date set not null;
alter table public.platform_subscription_payments add column updated_at timestamptz not null default now();
alter table public.platform_subscription_payments add column provider_name text;
alter table public.platform_subscription_payments add column provider_reference text;
alter table public.platform_subscription_payments drop constraint platform_subscription_payments_status_check;
update public.platform_subscription_payments set status = 'completed' where status = 'paid';
alter table public.platform_subscription_payments alter column status set default 'pending';
alter table public.platform_subscription_payments add constraint platform_subscription_payments_status_check
  check (status in ('pending', 'completed', 'failed', 'refunded', 'cancelled'));
alter table public.platform_subscription_payments add constraint platform_subscription_payments_currency_check
  check (currency ~ '^[A-Z]{3}$');
create index platform_subscription_payments_gym_date_idx
  on public.platform_subscription_payments(gym_id, payment_date desc);
create index platform_subscription_payments_gym_status_date_idx
  on public.platform_subscription_payments(gym_id, status, payment_date desc);
create index platform_subscription_payments_subscription_date_idx
  on public.platform_subscription_payments(subscription_id, payment_date desc);

create function public.guard_member_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.gym_user_memberships m
    where m.user_id = (select auth.uid()) and m.gym_id = new.gym_id and m.role = 'gym_admin'
  ) then
    raise exception using errcode = '42501', message = 'Not authorized to manage member payments for this gym';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.payment_date := now();
    new.paid_at := new.payment_date;
    new.recorded_by := (select auth.uid());
    return new;
  end if;
  if (new.gym_id, new.member_id, new.membership_id, new.amount, new.currency, new.payment_method,
      new.payment_date, new.paid_at, new.reference, new.provider_name, new.provider_reference,
      new.recorded_by) is distinct from
     (old.gym_id, old.member_id, old.membership_id, old.amount, old.currency, old.payment_method,
      old.payment_date, old.paid_at, old.reference, old.provider_name, old.provider_reference,
      old.recorded_by) then
    raise exception using errcode = '42501', message = 'Recorded payment details are immutable';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'pending' and new.status in ('completed', 'failed', 'cancelled')) or
    (old.status = 'completed' and new.status = 'refunded')
  ) then
    raise exception using errcode = '23514', message = 'Invalid member payment status transition';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_member_payment() from public, anon, authenticated;
create trigger member_payments_guard before insert or update on public.member_payments
for each row execute function public.guard_member_payment();
create trigger member_payments_set_updated_at before update on public.member_payments
for each row execute function public.set_updated_at();

-- Payment creation derives the gym and currency from the authenticated gym admin.
-- Status is intentionally fixed to pending; only the guarded transitions above can settle it.
create function public.create_member_payment(
  p_member_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null,
  p_notes text default null
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  gym_count integer;
  target_gym_id uuid;
  target_currency char(3);
  target_timezone text;
  gym_today date;
  target_membership_id uuid;
  payment_id uuid;
begin
  select count(*)::integer, (array_agg(m.gym_id order by m.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships m
  where m.user_id = (select auth.uid()) and m.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9999999999.99 or p_amount <> trunc(p_amount, 2) then
    raise exception using errcode = '23514', message = 'Payment amount must be positive and use at most two decimal places';
  end if;
  if p_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then
    raise exception using errcode = '22023', message = 'Invalid payment method';
  end if;
  if p_reference is not null and char_length(trim(p_reference)) > 120 then
    raise exception using errcode = '22023', message = 'Payment reference is too long';
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception using errcode = '22023', message = 'Payment note is too long';
  end if;
  if not exists (select 1 from public.members m where m.id = p_member_id and m.gym_id = target_gym_id) then
    raise exception using errcode = '42501', message = 'Member is unavailable';
  end if;

  select coalesce(gs.currency, 'INR'), coalesce(gs.timezone, 'Asia/Kolkata')
    into target_currency, target_timezone
  from public.gym_settings gs where gs.gym_id = target_gym_id;
  target_currency := coalesce(target_currency, 'INR');
  target_timezone := coalesce(target_timezone, 'Asia/Kolkata');
  gym_today := (now() at time zone target_timezone)::date;
  select mm.id into target_membership_id
  from public.member_memberships mm
  where mm.member_id = p_member_id and mm.gym_id = target_gym_id
    and mm.status = 'active' and mm.start_date <= gym_today and mm.end_date >= gym_today
  order by mm.start_date desc, mm.created_at desc, mm.id desc limit 1;

  insert into public.member_payments(gym_id, member_id, membership_id, amount, currency,
    payment_method, status, reference, notes, payment_date, paid_at, recorded_by)
  values (target_gym_id, p_member_id, target_membership_id, p_amount, target_currency,
    p_payment_method, 'pending', nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), now(), now(), (select auth.uid()))
  returning id into payment_id;
  return payment_id;
end;
$$;
revoke all on function public.create_member_payment(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.create_member_payment(uuid, numeric, text, text, text) to authenticated;

create function public.guard_platform_subscription()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'Not authorized to manage VYRO subscriptions';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and not (
    (old.status = 'trial' and new.status in ('active', 'past_due', 'expired', 'suspended', 'cancelled')) or
    (old.status = 'active' and new.status in ('past_due', 'expired', 'suspended', 'cancelled')) or
    (old.status = 'past_due' and new.status in ('active', 'expired', 'suspended', 'cancelled')) or
    (old.status = 'suspended' and new.status in ('active', 'expired', 'cancelled')) or
    (old.status = 'expired' and new.status in ('active', 'cancelled'))
  ) then
    raise exception using errcode = '23514', message = 'Invalid VYRO subscription status transition';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_platform_subscription() from public, anon, authenticated;
create trigger platform_subscriptions_guard before insert or update on public.platform_subscriptions
for each row execute function public.guard_platform_subscription();

create function public.guard_platform_subscription_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'Not authorized to manage VYRO payments';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.payment_date := now();
    new.paid_at := new.payment_date;
    return new;
  end if;
  if (new.subscription_id, new.gym_id, new.amount, new.currency, new.payment_date, new.paid_at,
      new.reference, new.provider_name, new.provider_reference) is distinct from
     (old.subscription_id, old.gym_id, old.amount, old.currency, old.payment_date, old.paid_at,
      old.reference, old.provider_name, old.provider_reference) then
    raise exception using errcode = '42501', message = 'Recorded platform payment details are immutable';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'pending' and new.status in ('completed', 'failed', 'cancelled')) or
    (old.status = 'completed' and new.status = 'refunded')
  ) then
    raise exception using errcode = '23514', message = 'Invalid platform payment status transition';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_platform_subscription_payment() from public, anon, authenticated;
create trigger platform_subscription_payments_guard before insert or update on public.platform_subscription_payments
for each row execute function public.guard_platform_subscription_payment();
create trigger platform_subscription_payments_set_updated_at before update on public.platform_subscription_payments
for each row execute function public.set_updated_at();

-- Rebind the existing audit triggers to record meaningful financial status changes.
drop trigger member_payments_audit_event on public.member_payments;
create function public.audit_member_payment_event()
returns trigger language plpgsql set search_path = '' as $$
declare
  audit_action text;
  audit_metadata jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    audit_action := 'member_payment.recorded';
  elsif new.status is distinct from old.status then
    audit_action := case when new.status = 'refunded' then 'member_payment.refunded' else 'member_payment.status_changed' end;
    audit_metadata := jsonb_build_object('from', old.status, 'to', new.status);
  else
    audit_action := 'member_payment.updated';
  end if;
  insert into public.audit_logs(actor_user_id, gym_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), new.gym_id, audit_action, 'member_payment', new.id, audit_metadata);
  return new;
end;
$$;
create trigger member_payments_audit_event after insert or update on public.member_payments
for each row execute function public.audit_member_payment_event();

drop trigger subscriptions_audit_event on public.platform_subscriptions;
create function public.audit_platform_subscription_event()
returns trigger language plpgsql set search_path = '' as $$
declare
  audit_action text;
  audit_metadata jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    audit_action := 'subscription.created';
  elsif new.status is distinct from old.status and new.status = 'suspended' then
    audit_action := 'subscription.suspended';
    audit_metadata := jsonb_build_object('from', old.status, 'to', new.status);
  elsif new.status is distinct from old.status and new.status = 'cancelled' then
    audit_action := 'subscription.cancelled';
    audit_metadata := jsonb_build_object('from', old.status, 'to', new.status);
  elsif new.expires_on > old.expires_on then
    audit_action := 'subscription.renewed';
    audit_metadata := jsonb_build_object('from', old.expires_on, 'to', new.expires_on);
  elsif new.status is distinct from old.status then
    audit_action := 'subscription.status_changed';
    audit_metadata := jsonb_build_object('from', old.status, 'to', new.status);
  else
    audit_action := 'subscription.updated';
  end if;
  insert into public.audit_logs(actor_user_id, gym_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), new.gym_id, audit_action, 'platform_subscription', new.id, audit_metadata);
  return new;
end;
$$;
create trigger subscriptions_audit_event after insert or update on public.platform_subscriptions
for each row execute function public.audit_platform_subscription_event();

drop trigger platform_payments_audit_event on public.platform_subscription_payments;
create function public.audit_platform_payment_event()
returns trigger language plpgsql set search_path = '' as $$
declare
  audit_action text;
  audit_metadata jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    audit_action := 'platform_payment.recorded';
  elsif new.status is distinct from old.status then
    audit_action := case when new.status = 'refunded' then 'platform_payment.refunded' else 'platform_payment.status_changed' end;
    audit_metadata := jsonb_build_object('from', old.status, 'to', new.status);
  else
    audit_action := 'platform_payment.updated';
  end if;
  insert into public.audit_logs(actor_user_id, gym_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), new.gym_id, audit_action, 'platform_subscription_payment', new.id, audit_metadata);
  return new;
end;
$$;
create trigger platform_payments_audit_event after insert or update on public.platform_subscription_payments
for each row execute function public.audit_platform_payment_event();

-- Summary functions count completed payments only; refunded payments are historical,
-- not revenue. Platform and gym ledgers remain separate in both calculations.
create or replace function public.get_platform_dashboard_summary()
returns table (
  total_gyms bigint,
  active_gyms bigint,
  expiring_gyms bigint,
  inactive_gyms bigint,
  active_members bigint,
  month_revenue numeric,
  upcoming_renewals bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare platform_timezone text;
begin
  if not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select ps.default_timezone into platform_timezone from public.platform_settings ps where ps.id = 1;
  platform_timezone := coalesce(platform_timezone, 'Asia/Kolkata');
  return query select
    (select count(*) from public.gyms),
    (select count(*) from public.gyms g where g.status = 'active'),
    (select count(*) from public.gyms g where g.status = 'expiring' or exists (
      select 1 from public.platform_subscriptions s where s.gym_id = g.id and s.status in ('active', 'trial')
        and s.expires_on between (now() at time zone platform_timezone)::date and (now() at time zone platform_timezone)::date + 30
    )),
    (select count(*) from public.gyms g where g.status in ('expired', 'suspended')),
    (select count(*) from public.members m where m.status = 'active' and m.archived_at is null),
    (select coalesce(sum(p.amount), 0) from public.platform_subscription_payments p
      where p.status = 'completed'
        and p.payment_date >= date_trunc('month', now() at time zone platform_timezone)::timestamp at time zone platform_timezone
        and p.payment_date < (date_trunc('month', now() at time zone platform_timezone) + interval '1 month')::timestamp at time zone platform_timezone),
    (select count(*) from public.platform_subscriptions s where s.status in ('active', 'trial', 'past_due')
      and s.expires_on between (now() at time zone platform_timezone)::date and (now() at time zone platform_timezone)::date + 30);
end;
$$;

drop function public.get_gym_dashboard_summary(uuid);
create function public.get_gym_dashboard_summary(target_gym_id uuid)
returns table (
  total_members bigint,
  active_members bigint,
  expiring_members bigint,
  expired_members bigint,
  today_attendance bigint,
  month_revenue numeric,
  today_revenue numeric
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  gym_timezone text;
  gym_today date;
begin
  if not exists (
    select 1 from public.gym_user_memberships m where m.user_id = (select auth.uid())
      and m.gym_id = target_gym_id and m.role = 'gym_admin'
  ) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select coalesce(gs.timezone, 'Asia/Kolkata') into gym_timezone
  from public.gym_settings gs where gs.gym_id = target_gym_id;
  gym_timezone := coalesce(gym_timezone, 'Asia/Kolkata');
  gym_today := (now() at time zone gym_timezone)::date;
  return query
  with latest_membership as (
    select distinct on (mm.member_id) mm.member_id, mm.status, mm.end_date
    from public.member_memberships mm where mm.gym_id = target_gym_id
    order by mm.member_id, mm.start_date desc, mm.created_at desc, mm.id desc
  )
  select
    (select count(*) from public.members m where m.gym_id = target_gym_id and m.archived_at is null),
    (select count(*) from public.members m where m.gym_id = target_gym_id and m.status = 'active' and m.archived_at is null),
    (select count(*) from latest_membership lm where lm.status = 'active' and lm.end_date >= gym_today and lm.end_date <= gym_today + 30),
    (select count(*) from latest_membership lm where lm.status = 'expired' or (lm.status = 'active' and lm.end_date < gym_today)),
    (select count(*) from public.attendance_records a where a.gym_id = target_gym_id
      and a.checked_in_at >= (gym_today::timestamp at time zone gym_timezone)
      and a.checked_in_at < ((gym_today + 1)::timestamp at time zone gym_timezone)),
    (select coalesce(sum(p.amount), 0) from public.member_payments p
      where p.gym_id = target_gym_id and p.status = 'completed'
        and p.payment_date >= date_trunc('month', now() at time zone gym_timezone)::timestamp at time zone gym_timezone
        and p.payment_date < (date_trunc('month', now() at time zone gym_timezone) + interval '1 month')::timestamp at time zone gym_timezone),
    (select coalesce(sum(p.amount), 0) from public.member_payments p
      where p.gym_id = target_gym_id and p.status = 'completed'
        and p.payment_date >= (gym_today::timestamp at time zone gym_timezone)
        and p.payment_date < ((gym_today + 1)::timestamp at time zone gym_timezone));
end;
$$;
revoke all on function public.get_gym_dashboard_summary(uuid) from public, anon;
grant execute on function public.get_gym_dashboard_summary(uuid) to authenticated;
