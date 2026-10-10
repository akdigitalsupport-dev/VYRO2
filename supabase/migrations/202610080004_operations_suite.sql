-- Complete gym operations tables and their server-side tenant boundaries.
-- Existing membership, payment, attendance, notification, and photo objects are reused.

begin;

create table public.trainers (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  phone text check (phone is null or char_length(phone) <= 40),
  specialization text check (specialization is null or char_length(specialization) <= 120),
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainers_id_gym_key unique (id, gym_id)
);
create index trainers_gym_status_name_idx on public.trainers(gym_id, status, name);
alter table public.trainers enable row level security;
revoke all on public.trainers from anon, authenticated;
grant select, insert, update on public.trainers to authenticated;
create policy "trainers tenant access" on public.trainers
  for all to authenticated using (public.has_gym_access(gym_id))
  with check (public.has_gym_access(gym_id));
create trigger trainers_set_updated_at before update on public.trainers
  for each row execute function public.set_updated_at();

create table public.gym_expenses (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  expense_date date not null default current_date,
  category text not null check (category in ('rent', 'electricity', 'equipment', 'maintenance', 'salary', 'marketing', 'other')),
  amount numeric(12,2) not null check (amount > 0),
  description text not null check (char_length(trim(description)) between 1 and 240),
  reference text check (reference is null or char_length(reference) <= 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  recorded_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gym_expenses_id_gym_key unique (id, gym_id)
);
create index gym_expenses_gym_date_category_idx on public.gym_expenses(gym_id, expense_date desc, category) where archived_at is null;
alter table public.gym_expenses enable row level security;
revoke all on public.gym_expenses from anon, authenticated;
grant select, insert, update on public.gym_expenses to authenticated;
create policy "gym expenses tenant access" on public.gym_expenses
  for all to authenticated using (public.has_gym_access(gym_id))
  with check (public.has_gym_access(gym_id));
create trigger gym_expenses_set_updated_at before update on public.gym_expenses
  for each row execute function public.set_updated_at();

-- Auditing uses the authenticated session and existing audit-log policy.
create function public.audit_gym_record_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  event_action text;
  event_entity text;
  event_metadata jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'gym_expenses' then
    event_entity := 'gym_expense';
    if tg_op = 'INSERT' then
      event_action := 'expense.recorded';
      event_metadata := jsonb_build_object('category', new.category, 'amount', new.amount);
    elsif new.archived_at is distinct from old.archived_at and new.archived_at is not null then
      event_action := 'expense.archived';
      event_metadata := jsonb_build_object('category', new.category, 'amount', new.amount);
    else
      event_action := 'expense.updated';
      event_metadata := jsonb_build_object('category', new.category, 'amount', new.amount);
    end if;
  elsif tg_table_name = 'trainers' then
    event_entity := 'trainer';
    event_action := case when tg_op = 'INSERT' then 'trainer.created' else 'trainer.updated' end;
  else
    raise exception using errcode = '22023', message = 'Unsupported audit event table';
  end if;

  insert into public.audit_logs(actor_user_id, gym_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), new.gym_id, event_action, event_entity, new.id, event_metadata);
  return new;
end;
$$;
revoke all on function public.audit_gym_record_event() from public, anon;
create trigger gym_expenses_audit_event after insert or update on public.gym_expenses
  for each row execute function public.audit_gym_record_event();
create trigger trainers_audit_event after insert or update on public.trainers
  for each row execute function public.audit_gym_record_event();

-- Notifications reuse the existing audit fan-out and preference tables.
alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type in (
  'membership_expiring', 'membership_expiry_reminder', 'membership_expired',
  'payment_recorded', 'payment_refunded', 'member_created', 'membership_created', 'expense_recorded',
  'gym_subscription_expiring', 'gym_subscription_expired', 'platform_payment_recorded', 'platform_payment_refunded'
));
alter table public.notification_preferences drop constraint notification_preferences_event_type_check;
alter table public.notification_preferences add constraint notification_preferences_event_type_check check (event_type in (
  'membership_expiring', 'membership_expiry_reminder', 'membership_expired',
  'payment_recorded', 'payment_refunded', 'member_created', 'membership_created', 'expense_recorded',
  'gym_subscription_expiring', 'gym_subscription_expired', 'platform_payment_recorded', 'platform_payment_refunded'
));

create or replace function public.fan_out_audit_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_event_audience text;
  notification_title text;
  notification_message text;
begin
  if new.action = 'member_payment.recorded' then
    v_event_type := 'payment_recorded'; v_event_audience := 'gym';
    notification_title := 'Member payment recorded'; notification_message := 'A member payment was received.';
  elsif new.action = 'member_payment.refunded' then
    v_event_type := 'payment_refunded'; v_event_audience := 'gym';
    notification_title := 'Member payment refunded'; notification_message := 'A member payment was marked as refunded.';
  elsif new.action = 'member.created' then
    v_event_type := 'member_created'; v_event_audience := 'gym';
    notification_title := 'New member added'; notification_message := 'A new member was added to your gym.';
  elsif new.action = 'membership.created' then
    v_event_type := 'membership_created'; v_event_audience := 'gym';
    notification_title := 'Membership assigned'; notification_message := 'A membership was assigned or renewed.';
  elsif new.action = 'expense.recorded' then
    v_event_type := 'expense_recorded'; v_event_audience := 'gym';
    notification_title := 'Expense recorded'; notification_message := 'A gym expense was recorded.';
  elsif new.action = 'platform_payment.recorded' then
    v_event_type := 'platform_payment_recorded'; v_event_audience := 'platform';
    notification_title := 'VYRO payment recorded'; notification_message := 'A VYRO subscription payment was recorded.';
  elsif new.action = 'platform_payment.refunded' then
    v_event_type := 'platform_payment_refunded'; v_event_audience := 'platform';
    notification_title := 'VYRO payment refunded'; notification_message := 'A VYRO subscription payment was marked as refunded.';
  else
    return new;
  end if;

  if v_event_audience = 'gym' and new.gym_id is not null then
    insert into public.notifications(recipient_user_id, audience, gym_id, notification_type, title, message,
      entity_type, entity_id, metadata, idempotency_key)
    select distinct gum.user_id, 'gym', new.gym_id, v_event_type, notification_title, notification_message,
      new.entity_type, new.entity_id, '{}'::jsonb, 'audit:' || new.id::text
    from public.gym_user_memberships gum
    join public.user_profiles up on up.user_id = gum.user_id and up.role = 'gym_admin'
    where gum.gym_id = new.gym_id and gum.role = 'gym_admin'
      and not exists (
        select 1 from public.notification_preferences pref
        where pref.user_id = gum.user_id and pref.audience = 'gym' and pref.gym_id = new.gym_id
          and pref.event_type = v_event_type and pref.channel = 'in_app' and not pref.enabled
      )
    on conflict (recipient_user_id, idempotency_key) do nothing;
  elsif v_event_audience = 'platform' then
    insert into public.notifications(recipient_user_id, audience, gym_id, notification_type, title, message,
      entity_type, entity_id, metadata, idempotency_key)
    select up.user_id, 'platform', new.gym_id, v_event_type, notification_title, notification_message,
      new.entity_type, new.entity_id, '{}'::jsonb, 'audit:' || new.id::text
    from public.user_profiles up where up.role = 'platform_owner'
      and not exists (
        select 1 from public.notification_preferences pref
        where pref.user_id = up.user_id and pref.audience = 'platform' and pref.gym_id is null
          and pref.event_type = v_event_type and pref.channel = 'in_app' and not pref.enabled
      )
    on conflict (recipient_user_id, idempotency_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.fan_out_audit_notification() from public, anon, authenticated;

create or replace function public.set_notification_preference(p_event_type text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  target_gym_id uuid;
  target_audience text;
begin
  if caller_id is null or p_enabled is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  select up.role into caller_role from public.user_profiles up where up.user_id = caller_id;
  if caller_role = 'gym_admin' then
    if p_event_type not in ('membership_expiring', 'membership_expiry_reminder', 'membership_expired',
      'payment_recorded', 'payment_refunded', 'member_created', 'membership_created', 'expense_recorded') then
      raise exception using errcode = '22023', message = 'Invalid gym notification event';
    end if;
    if (select count(*) from public.gym_user_memberships gum where gum.user_id = caller_id and gum.role = 'gym_admin') <> 1 then
      raise exception using errcode = '42501', message = 'A single gym membership is required';
    end if;
    select gum.gym_id into target_gym_id from public.gym_user_memberships gum
      where gum.user_id = caller_id and gum.role = 'gym_admin';
    target_audience := 'gym';
  elsif caller_role = 'platform_owner' then
    if p_event_type not in ('gym_subscription_expiring', 'gym_subscription_expired', 'platform_payment_recorded', 'platform_payment_refunded') then
      raise exception using errcode = '22023', message = 'Invalid platform notification event';
    end if;
    target_audience := 'platform';
  else
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  insert into public.notification_preferences(user_id, audience, gym_id, event_type, channel, enabled)
  values (caller_id, target_audience, target_gym_id, p_event_type, 'in_app', p_enabled)
  on conflict (user_id, audience, gym_id, event_type, channel)
  do update set enabled = excluded.enabled;
end;
$$;
revoke all on function public.set_notification_preference(text, boolean) from public, anon;
grant execute on function public.set_notification_preference(text, boolean) to authenticated;

-- A new private bucket stores gym branding assets separately from member photos.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('vyro-gym-logos', 'vyro-gym-logos', false, 2097152, array['image/jpeg', 'image/png']::text[])
on conflict (id) do nothing;
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'vyro-gym-logos' and name = 'vyro-gym-logos'
    and public = false and file_size_limit = 2097152 and allowed_mime_types = array['image/jpeg', 'image/png']::text[]) then
    raise exception 'Bucket vyro-gym-logos exists with an unexpected configuration';
  end if;
end;
$$;
create policy "vyro gym logos select" on storage.objects for select to authenticated
  using (bucket_id = 'vyro-gym-logos'
    and public.has_gym_access(public.storage_path_gym_id(name))
    and name ~ ('^' || public.storage_path_gym_id(name)::text || '/logo/logo-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png)$'));
create policy "vyro gym logos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'vyro-gym-logos'
    and public.has_gym_access(public.storage_path_gym_id(name))
    and name ~ ('^' || public.storage_path_gym_id(name)::text || '/logo/logo-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png)$'));
create policy "vyro gym logos update" on storage.objects for update to authenticated
  using (bucket_id = 'vyro-gym-logos'
    and public.has_gym_access(public.storage_path_gym_id(name))
    and name ~ ('^' || public.storage_path_gym_id(name)::text || '/logo/logo-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png)$'))
  with check (bucket_id = 'vyro-gym-logos'
    and public.has_gym_access(public.storage_path_gym_id(name))
    and name ~ ('^' || public.storage_path_gym_id(name)::text || '/logo/logo-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png)$'));
create policy "vyro gym logos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'vyro-gym-logos'
    and public.has_gym_access(public.storage_path_gym_id(name))
    and name ~ ('^' || public.storage_path_gym_id(name)::text || '/logo/logo-[0-9a-f-]{36}[.](jpg|jpeg|png)$'));

create function public.update_gym_profile(
  p_name text,
  p_owner_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_currency text,
  p_timezone text,
  p_logo_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  gym_count integer;
  target_gym_id uuid;
begin
  if caller_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = caller_id and gum.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 160
    or char_length(coalesce(p_owner_name, '')) > 120
    or char_length(coalesce(p_phone, '')) > 40
    or char_length(coalesce(p_email, '')) > 254
    or char_length(coalesce(p_address, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Gym profile values are invalid';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode = '22023', message = 'Currency must be a three-letter uppercase code';
  end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = p_timezone) then
    raise exception using errcode = '22023', message = 'Select a valid timezone';
  end if;
  if p_logo_path is not null and (
    public.storage_path_gym_id(p_logo_path) is distinct from target_gym_id
    or p_logo_path !~ ('^' || target_gym_id::text || '/logo/logo-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png)$')
  ) then
    raise exception using errcode = '42501', message = 'Gym logo path is invalid';
  end if;
  update public.gyms set name = trim(p_name), owner_name = nullif(trim(p_owner_name), ''),
    phone = nullif(trim(p_phone), ''), email = nullif(trim(p_email), ''), address = nullif(trim(p_address), ''),
    logo_path = p_logo_path
  where id = target_gym_id;
  update public.gym_settings set currency = p_currency, timezone = p_timezone
  where gym_id = target_gym_id;
end;
$$;
revoke all on function public.update_gym_profile(text, text, text, text, text, text, text, text) from public, anon, service_role;
grant execute on function public.update_gym_profile(text, text, text, text, text, text, text, text) to authenticated;

create function public.get_gym_expense_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  gym_count integer;
  target_gym_id uuid;
  report jsonb;
begin
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = (select auth.uid()) and gum.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365 then
    raise exception using errcode = '22023', message = 'Expense dates must be valid and span no more than 366 days';
  end if;
  select jsonb_build_object(
    'total', coalesce(sum(e.amount), 0),
    'count', count(e.id),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('date', q.expense_date, 'amount', q.amount) order by q.expense_date)
      from (select e.expense_date, sum(e.amount)::numeric as amount from public.gym_expenses e
        where e.gym_id = target_gym_id and e.archived_at is null and e.expense_date between p_from and p_to
        group by e.expense_date) q), '[]'::jsonb),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', q.category, 'amount', q.amount, 'count', q.expense_count)
      order by q.category) from (select e.category, sum(e.amount)::numeric as amount, count(*)::bigint as expense_count
        from public.gym_expenses e where e.gym_id = target_gym_id and e.archived_at is null
          and e.expense_date between p_from and p_to group by e.category) q), '[]'::jsonb)
  ) into report
  from public.gym_expenses e
  where e.gym_id = target_gym_id and e.archived_at is null and e.expense_date between p_from and p_to;
  return report;
end;
$$;
revoke all on function public.get_gym_expense_report(date, date) from public, anon;
grant execute on function public.get_gym_expense_report(date, date) to authenticated;

create function public.get_gym_financial_snapshot(p_as_of date default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  gym_count integer;
  target_gym_id uuid;
  gym_timezone text;
  as_of_date date;
  month_start date;
  month_revenue numeric;
  month_expenses numeric;
  expected_revenue numeric;
  outstanding_amount numeric;
begin
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = (select auth.uid()) and gum.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select coalesce(gs.timezone, 'Asia/Kolkata') into gym_timezone
  from public.gym_settings gs where gs.gym_id = target_gym_id;
  gym_timezone := coalesce(gym_timezone, 'Asia/Kolkata');
  as_of_date := coalesce(p_as_of, (now() at time zone gym_timezone)::date);
  month_start := date_trunc('month', as_of_date)::date;

  select coalesce(sum(p.amount), 0) into month_revenue
  from public.member_payments p
  where p.gym_id = target_gym_id and p.status = 'completed'
    and p.payment_date >= month_start::timestamp at time zone gym_timezone
    and p.payment_date < (as_of_date + 1)::timestamp at time zone gym_timezone;
  select coalesce(sum(e.amount), 0) into month_expenses
  from public.gym_expenses e
  where e.gym_id = target_gym_id and e.archived_at is null
    and e.expense_date between month_start and as_of_date;

  with current_memberships as (
    select distinct on (mm.member_id) mm.id, mm.price_snapshot
    from public.member_memberships mm
    join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
    where mm.gym_id = target_gym_id and mm.status = 'active'
      and mm.start_date <= as_of_date and mm.end_date >= as_of_date
      and m.status = 'active' and m.archived_at is null
    order by mm.member_id, mm.start_date desc, mm.created_at desc, mm.id desc
  ), membership_paid as (
    select p.membership_id, sum(p.amount)::numeric as amount
    from public.member_payments p
    where p.gym_id = target_gym_id and p.status = 'completed' and p.membership_id is not null
    group by p.membership_id
  )
  select coalesce(sum(cm.price_snapshot), 0),
    coalesce(sum(greatest(cm.price_snapshot - coalesce(mp.amount, 0), 0)), 0)
    into expected_revenue, outstanding_amount
  from current_memberships cm left join membership_paid mp on mp.membership_id = cm.id;

  return jsonb_build_object(
    'month_revenue', month_revenue,
    'month_expenses', month_expenses,
    'net_income', month_revenue - month_expenses,
    'expected_revenue', expected_revenue,
    'outstanding', outstanding_amount
  );
end;
$$;
revoke all on function public.get_gym_financial_snapshot(date) from public, anon;
grant execute on function public.get_gym_financial_snapshot(date) to authenticated;

create function public.permanently_delete_archived_member(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym_count integer;
  target_gym_id uuid;
  target_photo_path text;
  target_member_code text;
begin
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = (select auth.uid()) and gum.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select m.photo_path, m.member_code into target_photo_path, target_member_code
  from public.members m
  where m.id = p_member_id and m.gym_id = target_gym_id
    and (m.status = 'archived' or m.archived_at is not null)
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Archived member is unavailable';
  end if;

  insert into public.audit_logs(actor_user_id, gym_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), target_gym_id, 'member.permanently_deleted', 'member', p_member_id,
    jsonb_build_object('member_code', target_member_code));

  delete from public.member_payments where gym_id = target_gym_id and member_id = p_member_id;
  delete from public.attendance_records where gym_id = target_gym_id and member_id = p_member_id;
  delete from public.member_memberships where gym_id = target_gym_id and member_id = p_member_id;
  delete from public.members where id = p_member_id and gym_id = target_gym_id;
  if not found then raise exception using errcode = '40001', message = 'Member changed while deleting'; end if;
  return target_photo_path;
end;
$$;
revoke all on function public.permanently_delete_archived_member(uuid) from public, anon, service_role;
grant execute on function public.permanently_delete_archived_member(uuid) to authenticated;

commit;
