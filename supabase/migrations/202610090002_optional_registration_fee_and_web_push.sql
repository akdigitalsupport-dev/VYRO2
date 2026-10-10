begin;

-- Keep the applied 009/010 contracts intact. Replace client execution on the
-- prior enrollment signature with a choice-aware overload.
revoke all on function public.create_gym_member_with_registration(text, text, text, text, text, date, text, date, text, uuid, date, numeric, date, text, text, text, date, text, text, text)
  from public, anon, authenticated, service_role;

create function public.create_gym_member_with_registration(
  p_member_code text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_gender text,
  p_date_of_birth date,
  p_address text,
  p_joining_date date,
  p_member_notes text,
  p_membership_plan_id uuid,
  p_membership_start_date date,
  p_initial_payment_amount numeric,
  p_payment_date date,
  p_payment_method text,
  p_reference text,
  p_payment_notes text,
  p_registration_payment_date date,
  p_registration_payment_method text,
  p_registration_reference text,
  p_registration_notes text,
  p_charge_registration boolean
)
returns table(member_id uuid, membership_id uuid, payment_id uuid, registration_payment_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym_count integer;
  target_gym_id uuid;
  target_fee numeric(12,2);
  fee_enabled boolean;
  charge_fee boolean;
  target_currency char(3);
  target_timezone text;
  gym_today date;
  created_member_id uuid;
  created_membership_id uuid;
  created_payment_id uuid;
  created_registration_payment_id uuid;
begin
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = (select auth.uid()) and gum.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_charge_registration is null then
    raise exception using errcode = '22023', message = 'Registration fee choice is required';
  end if;

  select gs.registration_fee_amount, gs.registration_fee_enabled,
         coalesce(gs.currency, 'INR'), coalesce(gs.timezone, 'Asia/Kolkata')
    into target_fee, fee_enabled, target_currency, target_timezone
  from public.gym_settings gs
  where gs.gym_id = target_gym_id
  for update;
  if not found then raise exception using errcode = '42501', message = 'Gym settings are unavailable'; end if;
  charge_fee := fee_enabled and p_charge_registration;

  if charge_fee then
    if p_registration_payment_date is null
      or p_registration_payment_method is null
      or p_registration_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then
      raise exception using errcode = '22023', message = 'Registration payment date and method are required';
    end if;
    if p_registration_reference is not null and char_length(trim(p_registration_reference)) > 120 then
      raise exception using errcode = '22023', message = 'Registration payment reference is too long';
    end if;
    if p_registration_notes is not null and char_length(p_registration_notes) > 500 then
      raise exception using errcode = '22023', message = 'Registration payment note is too long';
    end if;
    gym_today := (now() at time zone target_timezone)::date;
    if p_registration_payment_date > gym_today then
      raise exception using errcode = '22023', message = 'Registration payment date cannot be in the future';
    end if;
  end if;

  select e.member_id, e.membership_id, e.payment_id
    into created_member_id, created_membership_id, created_payment_id
  from public.create_gym_member_with_initial_payment(
    p_member_code, p_full_name, p_phone, p_email, p_gender, p_date_of_birth,
    p_address, p_joining_date, p_member_notes, p_membership_plan_id,
    p_membership_start_date, p_initial_payment_amount, p_payment_date,
    p_payment_method, p_reference, p_payment_notes
  ) e;
  if created_member_id is null or created_membership_id is null then
    raise exception using errcode = '40001', message = 'Member enrollment did not complete';
  end if;

  if charge_fee then
    insert into public.member_registration_payments(
      gym_id, member_id, amount, currency, payment_date, payment_method,
      status, reference, notes, recorded_by
    ) values (
      target_gym_id, created_member_id, target_fee, target_currency,
      p_registration_payment_date, p_registration_payment_method, 'completed',
      nullif(trim(p_registration_reference), ''), nullif(trim(p_registration_notes), ''),
      (select auth.uid())
    ) returning id into created_registration_payment_id;
  end if;

  return query select created_member_id, created_membership_id, created_payment_id, created_registration_payment_id;
end;
$$;
revoke all on function public.create_gym_member_with_registration(text, text, text, text, text, date, text, date, text, uuid, date, numeric, date, text, text, text, date, text, text, text, boolean)
  from public, anon, service_role;
grant execute on function public.create_gym_member_with_registration(text, text, text, text, text, date, text, date, text, uuid, date, numeric, date, text, text, text, date, text, text, text, boolean)
  to authenticated;

create table public.membership_notification_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  membership_id uuid not null,
  member_id uuid not null,
  event_type text not null check (event_type in ('membership_expiring', 'membership_expired')),
  event_date date not null,
  created_at timestamptz not null default now(),
  constraint membership_notification_events_membership_gym_fk
    foreign key (membership_id, gym_id, member_id) references public.member_memberships(id, gym_id, member_id) on delete cascade,
  constraint membership_notification_events_unique
    unique (gym_id, membership_id, event_type, event_date)
);
alter table public.membership_notification_events enable row level security;
revoke all on public.membership_notification_events from public, anon, authenticated, service_role;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null check (char_length(p256dh) between 20 and 300),
  auth_key text not null check (char_length(auth_key) between 10 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz
);
create index push_subscriptions_user_gym_active_idx
  on public.push_subscriptions(user_id, gym_id) where disabled_at is null;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
create policy "push subscriptions owned gym-admin access" on public.push_subscriptions
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_gym_access(gym_id)
    and exists (select 1 from public.gym_user_memberships gum
      where gum.user_id = (select auth.uid()) and gum.gym_id = push_subscriptions.gym_id and gum.role = 'gym_admin')
  )
  with check (
    user_id = (select auth.uid())
    and public.has_gym_access(gym_id)
    and exists (select 1 from public.gym_user_memberships gum
      where gum.user_id = (select auth.uid()) and gum.gym_id = push_subscriptions.gym_id and gum.role = 'gym_admin')
  );
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

create table public.push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'disabled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 240),
  last_status_code integer,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_delivery_attempts_notification_subscription_unique unique (notification_id, subscription_id)
);
create index push_delivery_attempts_retry_idx
  on public.push_delivery_attempts(next_attempt_at, created_at)
  where status in ('pending', 'failed') and attempt_count < 5;
alter table public.push_delivery_attempts enable row level security;
revoke all on public.push_delivery_attempts from public, anon, authenticated, service_role;
grant all on public.push_delivery_attempts to service_role;

create function public.materialize_membership_expiry_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym_row record;
  event_row record;
  recipient_row record;
  local_today date;
  event_id uuid;
  notification_id uuid;
  stable_key text;
  created_events integer := 0;
begin
  for gym_row in
    select gs.gym_id, coalesce(gs.timezone, 'Asia/Kolkata') as timezone
    from public.gym_settings gs
  loop
    local_today := (statement_timestamp() at time zone gym_row.timezone)::date;
    for event_row in
      select mm.id as membership_id, mm.member_id, mm.gym_id, mm.end_date, event.event_type,
             local_today as event_date, event.days_before
      from public.member_memberships mm
      join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
      cross join (values ('membership_expiring'::text, 3), ('membership_expired'::text, 0)) as event(event_type, days_before)
      where mm.gym_id = gym_row.gym_id
        and mm.end_date = local_today + event.days_before
        and mm.start_date <= local_today
        and mm.status <> 'cancelled'
        and (event.event_type <> 'membership_expiring' or mm.status = 'active')
        and (m.status <> 'archived' and m.archived_at is null)
    loop
      event_id := null;
      insert into public.membership_notification_events(gym_id, membership_id, member_id, event_type, event_date)
      values (event_row.gym_id, event_row.membership_id, event_row.member_id, event_row.event_type, event_row.event_date)
      on conflict on constraint membership_notification_events_unique do nothing
      returning id into event_id;
      if event_id is null then continue; end if;
      created_events := created_events + 1;

      stable_key := 'membership-date:' || event_row.membership_id::text || ':' || event_row.event_type || ':' || event_row.event_date::text;
      for recipient_row in
        select distinct gum.user_id
        from public.gym_user_memberships gum
        join public.user_profiles up on up.user_id = gum.user_id and up.role = 'gym_admin'
        where gum.gym_id = event_row.gym_id and gum.role = 'gym_admin'
      loop
        if exists (select 1 from public.notification_preferences pref
          where pref.user_id = recipient_row.user_id and pref.audience = 'gym'
            and pref.gym_id = event_row.gym_id and pref.event_type = event_row.event_type
            and pref.channel = 'in_app' and not pref.enabled) then
          continue;
        end if;

        notification_id := null;
        insert into public.notifications(
          recipient_user_id, audience, gym_id, notification_type, title, message,
          entity_type, entity_id, metadata, idempotency_key
        ) values (
          recipient_row.user_id, 'gym', event_row.gym_id, event_row.event_type,
          case when event_row.event_type = 'membership_expiring' then 'Membership expires in 3 days' else 'Membership expires today' end,
          case when event_row.event_type = 'membership_expiring' then 'A member membership expires in three days.' else 'A member membership reaches its expiry date today.' end,
          'member_membership', event_row.membership_id,
          jsonb_build_object('event_date', event_row.event_date, 'days_before_expiry', event_row.days_before), stable_key
        ) on conflict (recipient_user_id, idempotency_key) do nothing
        returning id into notification_id;
        if notification_id is null then
          select n.id into notification_id from public.notifications n
          where n.recipient_user_id = recipient_row.user_id and n.idempotency_key = stable_key;
        end if;

        if exists (select 1 from public.notification_preferences pref
          where pref.user_id = recipient_row.user_id and pref.audience = 'gym'
            and pref.gym_id = event_row.gym_id and pref.event_type = event_row.event_type
            and pref.channel = 'push' and not pref.enabled) then
          continue;
        end if;
        insert into public.push_delivery_attempts(notification_id, subscription_id)
        select notification_id, ps.id from public.push_subscriptions ps
        where ps.user_id = recipient_row.user_id and ps.gym_id = event_row.gym_id and ps.disabled_at is null
        on conflict on constraint push_delivery_attempts_notification_subscription_unique do nothing;
      end loop;
    end loop;
  end loop;
  return created_events;
end;
$$;
revoke all on function public.materialize_membership_expiry_notifications() from public, anon, authenticated;
grant execute on function public.materialize_membership_expiry_notifications() to service_role;

create function public.claim_push_delivery_attempts(p_limit integer default 100)
returns table(delivery_id uuid, notification_id uuid, subscription_id uuid, attempt_count integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'Push delivery claim limit is invalid';
  end if;

  update public.push_delivery_attempts d
  set status = 'failed', lease_until = null,
      last_error = coalesce(d.last_error, 'Delivery lease expired after the final attempt'),
      updated_at = now()
  where d.status = 'processing' and d.lease_until <= now() and d.attempt_count >= 5;

  return query
  with candidates as (
    select d.id
    from public.push_delivery_attempts d
    where d.attempt_count < 5
      and ((d.status in ('pending', 'failed') and d.next_attempt_at <= now())
        or (d.status = 'processing' and d.lease_until <= now()))
    order by d.next_attempt_at, d.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.push_delivery_attempts d
    set status = 'processing', attempt_count = d.attempt_count + 1,
        lease_until = now() + interval '5 minutes', updated_at = now()
    from candidates c where d.id = c.id
    returning d.id, d.notification_id, d.subscription_id, d.attempt_count
  )
  select c.id, c.notification_id, c.subscription_id, c.attempt_count from claimed c;
end;
$$;
revoke all on function public.claim_push_delivery_attempts(integer) from public, anon, authenticated;
grant execute on function public.claim_push_delivery_attempts(integer) to service_role;

commit;
