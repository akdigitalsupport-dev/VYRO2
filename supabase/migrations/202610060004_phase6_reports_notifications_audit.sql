-- Phase 6: server-side reports, in-app notifications, preference storage.
-- Existing audit_logs and its RLS policies are reused unchanged.

create index members_gym_joining_date_idx on public.members(gym_id, joining_date desc);
create index member_memberships_gym_created_idx on public.member_memberships(gym_id, created_at desc);
create index attendance_gym_date_member_idx on public.attendance_records(gym_id, attendance_date, member_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  audience text not null check (audience in ('gym', 'platform')),
  gym_id uuid references public.gyms(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'membership_expiring', 'membership_expiry_reminder', 'membership_expired',
    'payment_recorded', 'payment_refunded', 'gym_subscription_expiring',
    'gym_subscription_expired', 'platform_payment_recorded', 'platform_payment_refunded'
  )),
  title text not null check (char_length(trim(title)) between 1 and 120),
  message text not null check (char_length(trim(message)) between 1 and 500),
  entity_type text check (entity_type is null or char_length(entity_type) <= 80),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 1 and 180),
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_audience_gym_check check ((audience = 'gym' and gym_id is not null) or audience = 'platform'),
  constraint notifications_read_at_check check ((is_read and read_at is not null) or (not is_read and read_at is null)),
  constraint notifications_recipient_idempotency_key unique (recipient_user_id, idempotency_key)
);
create index notifications_recipient_unread_idx on public.notifications(recipient_user_id, created_at desc) where is_read = false;
create index notifications_recipient_created_idx on public.notifications(recipient_user_id, audience, created_at desc);
create index notifications_gym_created_idx on public.notifications(gym_id, created_at desc) where gym_id is not null;
alter table public.notifications enable row level security;
grant select, update (is_read, read_at) on public.notifications to authenticated;
create policy "notifications read by recipient in authorized scope" on public.notifications
  for select to authenticated using (
    recipient_user_id = (select auth.uid()) and
    ((audience = 'platform' and public.is_platform_owner()) or
     (audience = 'gym' and gym_id is not null and public.has_gym_access(gym_id)))
  );
create policy "notifications update read state by recipient" on public.notifications
  for update to authenticated
  using (
    recipient_user_id = (select auth.uid()) and
    ((audience = 'platform' and public.is_platform_owner()) or
     (audience = 'gym' and gym_id is not null and public.has_gym_access(gym_id)))
  )
  with check (
    recipient_user_id = (select auth.uid()) and
    ((audience = 'platform' and public.is_platform_owner()) or
     (audience = 'gym' and gym_id is not null and public.has_gym_access(gym_id)))
  );

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audience text not null check (audience in ('gym', 'platform')),
  gym_id uuid references public.gyms(id) on delete cascade,
  event_type text not null check (event_type in (
    'membership_expiring', 'membership_expiry_reminder', 'membership_expired',
    'payment_recorded', 'payment_refunded', 'gym_subscription_expiring',
    'gym_subscription_expired', 'platform_payment_recorded', 'platform_payment_refunded'
  )),
  channel text not null check (channel in ('in_app', 'email', 'whatsapp', 'sms', 'push')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_audience_gym_check check ((audience = 'gym' and gym_id is not null) or audience = 'platform'),
  constraint notification_preferences_scope_unique unique nulls not distinct (user_id, audience, gym_id, event_type, channel)
);
create index notification_preferences_user_scope_idx
  on public.notification_preferences(user_id, audience, gym_id, event_type);
alter table public.notification_preferences enable row level security;
grant select, insert, update on public.notification_preferences to authenticated;
create policy "notification preferences self in authorized scope" on public.notification_preferences
  for all to authenticated
  using (
    user_id = (select auth.uid()) and
    ((audience = 'platform' and gym_id is null and public.is_platform_owner()) or
     (audience = 'gym' and gym_id is not null and public.has_gym_access(gym_id)))
  )
  with check (
    user_id = (select auth.uid()) and
    ((audience = 'platform' and gym_id is null and public.is_platform_owner()) or
     (audience = 'gym' and gym_id is not null and public.has_gym_access(gym_id)))
  );
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
for each row execute function public.set_updated_at();

-- Audit events generate notifications transactionally, with stable event keys.
create function public.fan_out_audit_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event_type text;
  v_event_audience text;
  notification_title text;
  notification_message text;
begin
  if new.action = 'member_payment.recorded' then
    v_event_type := 'payment_recorded'; v_event_audience := 'gym';
    notification_title := 'Member payment recorded'; notification_message := 'A member payment was recorded.';
  elsif new.action = 'member_payment.refunded' then
    v_event_type := 'payment_refunded'; v_event_audience := 'gym';
    notification_title := 'Member payment refunded'; notification_message := 'A member payment was marked as refunded.';
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
create trigger audit_logs_fan_out_notification after insert on public.audit_logs
for each row execute function public.fan_out_audit_notification();

-- Request-time, bounded expiry scan. Unique keys plus ON CONFLICT keep it idempotent.
create function public.sync_in_app_notifications()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  target_gym_id uuid;
  target_timezone text;
  today_local date;
  inserted_total integer := 0;
  inserted_rows integer := 0;
begin
  if caller_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  select up.role into caller_role from public.user_profiles up where up.user_id = caller_id;
  if caller_role = 'gym_admin' then
    if (select count(*) from public.gym_user_memberships gum where gum.user_id = caller_id and gum.role = 'gym_admin') <> 1 then
      raise exception using errcode = '42501', message = 'A single gym membership is required';
    end if;
    select gum.gym_id into target_gym_id from public.gym_user_memberships gum
      where gum.user_id = caller_id and gum.role = 'gym_admin';
    select coalesce(gs.timezone, 'Asia/Kolkata') into target_timezone from public.gym_settings gs where gs.gym_id = target_gym_id;
    target_timezone := coalesce(target_timezone, 'Asia/Kolkata');
    today_local := (now() at time zone target_timezone)::date;

    insert into public.notifications(recipient_user_id, audience, gym_id, notification_type, title, message,
      entity_type, entity_id, metadata, idempotency_key)
    select distinct gum.user_id, 'gym', target_gym_id, 'membership_expiring', 'Membership expiring soon',
      'A member membership is due to expire within 30 days.', 'member_membership', q.id, '{}'::jsonb,
      'membership-expiring:' || q.id::text || ':' || q.end_date::text
    from (
      select mm.id, mm.end_date from public.member_memberships mm
      join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
      where mm.gym_id = target_gym_id and mm.status = 'active' and m.archived_at is null
        and mm.start_date <= today_local and mm.end_date between today_local + 8 and today_local + 30
      order by mm.end_date, mm.id limit 100
    ) q
    join public.gym_user_memberships gum on gum.gym_id = target_gym_id and gum.role = 'gym_admin'
    join public.user_profiles up on up.user_id = gum.user_id and up.role = 'gym_admin'
    where not exists (select 1 from public.notification_preferences pref where pref.user_id = gum.user_id
      and pref.audience = 'gym' and pref.gym_id = target_gym_id and pref.event_type = 'membership_expiring'
      and pref.channel = 'in_app' and not pref.enabled)
    on conflict (recipient_user_id, idempotency_key) do nothing;
    get diagnostics inserted_rows = row_count; inserted_total := inserted_total + inserted_rows;

    insert into public.notifications(recipient_user_id, audience, gym_id, notification_type, title, message,
      entity_type, entity_id, metadata, idempotency_key)
    select distinct gum.user_id, 'gym', target_gym_id, 'membership_expiry_reminder', 'Membership expiry reminder',
      'A member membership is due to expire within 7 days.', 'member_membership', q.id, '{}'::jsonb,
      'membership-expiry-reminder:' || q.id::text || ':' || q.end_date::text
    from (
      select mm.id, mm.end_date from public.member_memberships mm
      join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
      where mm.gym_id = target_gym_id and mm.status = 'active' and m.archived_at is null
        and mm.start_date <= today_local and mm.end_date between today_local and today_local + 7
      order by mm.end_date, mm.id limit 100
    ) q
    join public.gym_user_memberships gum on gum.gym_id = target_gym_id and gum.role = 'gym_admin'
    join public.user_profiles up on up.user_id = gum.user_id and up.role = 'gym_admin'
    where not exists (select 1 from public.notification_preferences pref where pref.user_id = gum.user_id
      and pref.audience = 'gym' and pref.gym_id = target_gym_id and pref.event_type = 'membership_expiry_reminder'
      and pref.channel = 'in_app' and not pref.enabled)
    on conflict (recipient_user_id, idempotency_key) do nothing;
    get diagnostics inserted_rows = row_count; inserted_total := inserted_total + inserted_rows;

    insert into public.notifications(recipient_user_id, audience, gym_id, notification_type, title, message,
      entity_type, entity_id, metadata, idempotency_key)
    select distinct gum.user_id, 'gym', target_gym_id, 'membership_expired', 'Membership expired',
      'A member membership has expired recently.', 'member_membership', q.id, '{}'::jsonb,
      'membership-expired:' || q.id::text
    from (
      select mm.id from public.member_memberships mm
      join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
      where mm.gym_id = target_gym_id and m.archived_at is null
        and (mm.status = 'expired' or (mm.status = 'active' and mm.end_date < today_local))
        and mm.end_date between today_local - 30 and today_local - 1
      order by mm.end_date desc, mm.id limit 100
    ) q
    join public.gym_user_memberships gum on gum.gym_id = target_gym_id and gum.role = 'gym_admin'
    join public.user_profiles up on up.user_id = gum.user_id and up.role = 'gym_admin'
    where not exists (select 1 from public.notification_preferences pref where pref.user_id = gum.user_id
      and pref.audience = 'gym' and pref.gym_id = target_gym_id and pref.event_type = 'membership_expired'
      and pref.channel = 'in_app' and not pref.enabled)
    on conflict (recipient_user_id, idempotency_key) do nothing;
    get diagnostics inserted_rows = row_count; inserted_total := inserted_total + inserted_rows;
    return inserted_total;
  elsif caller_role = 'platform_owner' then
    select coalesce(ps.default_timezone, 'Asia/Kolkata') into target_timezone from public.platform_settings ps where ps.id = 1;
    target_timezone := coalesce(target_timezone, 'Asia/Kolkata');
    today_local := (now() at time zone target_timezone)::date;
    insert into public.notifications(recipient_user_id, audience, gym_id, notification_type, title, message,
      entity_type, entity_id, metadata, idempotency_key)
    select caller_id, 'platform', q.gym_id, 'gym_subscription_expiring', 'Gym subscription expiring',
      'A gym VYRO subscription expires within 30 days.', 'platform_subscription', q.id, '{}'::jsonb,
      'subscription-expiring:' || q.id::text || ':' || q.expires_on::text
    from (
      select s.id, s.gym_id, s.expires_on from public.platform_subscriptions s
      where s.status in ('trial', 'active', 'past_due') and s.expires_on between today_local and today_local + 30
      order by s.expires_on, s.id limit 100
    ) q
    where not exists (select 1 from public.notification_preferences pref where pref.user_id = caller_id
      and pref.audience = 'platform' and pref.gym_id is null and pref.event_type = 'gym_subscription_expiring'
      and pref.channel = 'in_app' and not pref.enabled)
    on conflict (recipient_user_id, idempotency_key) do nothing;
    get diagnostics inserted_rows = row_count; inserted_total := inserted_total + inserted_rows;
    insert into public.notifications(recipient_user_id, audience, gym_id, notification_type, title, message,
      entity_type, entity_id, metadata, idempotency_key)
    select caller_id, 'platform', q.gym_id, 'gym_subscription_expired', 'Gym subscription expired',
      'A gym VYRO subscription expired recently.', 'platform_subscription', q.id, '{}'::jsonb,
      'subscription-expired:' || q.id::text || ':' || q.expires_on::text
    from (
      select s.id, s.gym_id, s.expires_on from public.platform_subscriptions s
      where (s.status = 'expired' or s.expires_on < today_local)
        and s.expires_on between today_local - 30 and today_local - 1
      order by s.expires_on desc, s.id limit 100
    ) q
    where not exists (select 1 from public.notification_preferences pref where pref.user_id = caller_id
      and pref.audience = 'platform' and pref.gym_id is null and pref.event_type = 'gym_subscription_expired'
      and pref.channel = 'in_app' and not pref.enabled)
    on conflict (recipient_user_id, idempotency_key) do nothing;
    get diagnostics inserted_rows = row_count; inserted_total := inserted_total + inserted_rows;
    return inserted_total;
  end if;
  raise exception using errcode = '42501', message = 'Not authorized to sync notifications';
end;
$$;
revoke all on function public.sync_in_app_notifications() from public, anon;
grant execute on function public.sync_in_app_notifications() to authenticated;

create function public.set_notification_preference(p_event_type text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  target_gym_id uuid;
  target_audience text;
begin
  if caller_id is null or p_enabled is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  select up.role into caller_role from public.user_profiles up where up.user_id = caller_id;
  if caller_role = 'gym_admin' then
    if p_event_type not in ('membership_expiring', 'membership_expiry_reminder', 'membership_expired', 'payment_recorded', 'payment_refunded') then
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

create function public.get_gym_report(target_gym_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  gym_timezone text;
  today_local date;
  window_start timestamptz;
  window_end timestamptz;
  report jsonb;
begin
  if not exists (select 1 from public.gym_user_memberships gum
    where gum.user_id = (select auth.uid()) and gum.gym_id = target_gym_id and gum.role = 'gym_admin') then
    raise exception using errcode = '42501', message = 'Not authorized to read gym reports';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365 then
    raise exception using errcode = '22023', message = 'Report dates must be valid and span no more than 366 days';
  end if;
  select coalesce(gs.timezone, 'Asia/Kolkata') into gym_timezone from public.gym_settings gs where gs.gym_id = target_gym_id;
  gym_timezone := coalesce(gym_timezone, 'Asia/Kolkata');
  today_local := (now() at time zone gym_timezone)::date;
  window_start := p_from::timestamp at time zone gym_timezone;
  window_end := (p_to + 1)::timestamp at time zone gym_timezone;
  with latest_membership as (
    select distinct on (mm.member_id) mm.id, mm.member_id, mm.plan_name_snapshot, mm.status, mm.start_date, mm.end_date, mm.created_at
    from public.member_memberships mm where mm.gym_id = target_gym_id
    order by mm.member_id, mm.start_date desc, mm.created_at desc, mm.id desc
  ),
  daily_attendance as (
    select a.attendance_date as day, count(*)::bigint as check_ins, count(distinct a.member_id)::bigint as unique_members
    from public.attendance_records a where a.gym_id = target_gym_id and a.attendance_date between p_from and p_to
    group by a.attendance_date order by a.attendance_date
  ),
  daily_revenue as (
    select (p.payment_date at time zone gym_timezone)::date as day, coalesce(sum(p.amount), 0)::numeric as amount
    from public.member_payments p where p.gym_id = target_gym_id and p.status = 'completed'
      and p.payment_date >= window_start and p.payment_date < window_end
    group by (p.payment_date at time zone gym_timezone)::date order by (p.payment_date at time zone gym_timezone)::date
  )
  select jsonb_build_object(
    'members', jsonb_build_object(
      'total', (select count(*) from public.members m where m.gym_id = target_gym_id),
      'active', (select count(*) from public.members m where m.gym_id = target_gym_id and m.archived_at is null and m.status = 'active'),
      'inactive', (select count(*) from public.members m where m.gym_id = target_gym_id and m.archived_at is null and m.status = 'inactive'),
      'archived', (select count(*) from public.members m where m.gym_id = target_gym_id and m.archived_at is not null),
      'new_in_period', (select count(*) from public.members m where m.gym_id = target_gym_id and m.joining_date between p_from and p_to)
    ),
    'memberships', jsonb_build_object(
      'active', (select count(*) from latest_membership lm where lm.status = 'active' and lm.start_date <= today_local and lm.end_date >= today_local),
      'expiring', (select count(*) from latest_membership lm where lm.status = 'active' and lm.start_date <= today_local and lm.end_date between today_local and today_local + 30),
      'expired', (select count(*) from latest_membership lm where lm.status = 'expired' or (lm.status = 'active' and lm.end_date < today_local)),
      'renewals_in_period', (select count(*) from public.member_memberships mm where mm.gym_id = target_gym_id
        and mm.created_at >= window_start and mm.created_at < window_end and exists (
          select 1 from public.member_memberships prev where prev.gym_id = mm.gym_id and prev.member_id = mm.member_id
            and (prev.start_date < mm.start_date or (prev.start_date = mm.start_date and prev.created_at < mm.created_at))
        )),
      'by_plan', coalesce((select jsonb_agg(jsonb_build_object('plan', q.plan_name_snapshot, 'members', q.member_count, 'status', q.status)
        order by q.plan_name_snapshot, q.status) from (
          select lm.plan_name_snapshot, lm.status, count(*)::bigint as member_count from latest_membership lm
          group by lm.plan_name_snapshot, lm.status order by lm.plan_name_snapshot, lm.status limit 50
        ) q), '[]'::jsonb)
    ),
    'attendance', jsonb_build_object(
      'total_check_ins', (select count(*) from public.attendance_records a where a.gym_id = target_gym_id and a.attendance_date between p_from and p_to),
      'unique_members', (select count(distinct a.member_id) from public.attendance_records a where a.gym_id = target_gym_id and a.attendance_date between p_from and p_to),
      'by_day', coalesce((select jsonb_agg(jsonb_build_object('date', da.day, 'check_ins', da.check_ins, 'unique_members', da.unique_members) order by da.day) from daily_attendance da), '[]'::jsonb)
    ),
    'payments', jsonb_build_object(
      'completed_revenue', (select coalesce(sum(p.amount), 0) from public.member_payments p where p.gym_id = target_gym_id and p.status = 'completed' and p.payment_date >= window_start and p.payment_date < window_end),
      'pending_count', (select count(*) from public.member_payments p where p.gym_id = target_gym_id and p.status = 'pending' and p.payment_date >= window_start and p.payment_date < window_end),
      'failed_count', (select count(*) from public.member_payments p where p.gym_id = target_gym_id and p.status = 'failed' and p.payment_date >= window_start and p.payment_date < window_end),
      'refunded_count', (select count(*) from public.member_payments p where p.gym_id = target_gym_id and p.status = 'refunded' and p.payment_date >= window_start and p.payment_date < window_end),
      'by_method', coalesce((select jsonb_agg(jsonb_build_object('method', q.payment_method, 'count', q.payment_count, 'completed_revenue', q.revenue) order by q.payment_method) from (
        select p.payment_method, count(*)::bigint as payment_count, coalesce(sum(p.amount) filter (where p.status = 'completed'), 0)::numeric as revenue
        from public.member_payments p where p.gym_id = target_gym_id and p.payment_date >= window_start and p.payment_date < window_end
        group by p.payment_method order by p.payment_method limit 10
      ) q), '[]'::jsonb),
      'revenue_by_day', coalesce((select jsonb_agg(jsonb_build_object('date', dr.day, 'amount', dr.amount) order by dr.day) from daily_revenue dr), '[]'::jsonb)
    )
  ) into report;
  return report;
end;
$$;
revoke all on function public.get_gym_report(uuid, date, date) from public, anon;
grant execute on function public.get_gym_report(uuid, date, date) to authenticated;

create function public.get_platform_report(p_from date, p_to date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  platform_timezone text;
  today_local date;
  window_start timestamptz;
  window_end timestamptz;
  report jsonb;
begin
  if not public.is_platform_owner() then raise exception using errcode = '42501', message = 'Not authorized to read platform reports'; end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365 then
    raise exception using errcode = '22023', message = 'Report dates must be valid and span no more than 366 days';
  end if;
  select coalesce(ps.default_timezone, 'Asia/Kolkata') into platform_timezone from public.platform_settings ps where ps.id = 1;
  platform_timezone := coalesce(platform_timezone, 'Asia/Kolkata');
  today_local := (now() at time zone platform_timezone)::date;
  window_start := p_from::timestamp at time zone platform_timezone;
  window_end := (p_to + 1)::timestamp at time zone platform_timezone;
  select jsonb_build_object(
    'gyms', jsonb_build_object(
      'total', (select count(*) from public.gyms),
      'active', (select count(*) from public.gyms g where g.status = 'active'),
      'expiring_subscriptions', (select count(*) from public.platform_subscriptions s where s.status in ('trial', 'active', 'past_due') and s.expires_on between today_local and today_local + 30),
      'expired_or_suspended', (select count(*) from public.gyms g where g.status in ('expired', 'suspended'))
    ),
    'revenue', jsonb_build_object(
      'completed', (select coalesce(sum(p.amount), 0) from public.platform_subscription_payments p where p.status = 'completed' and p.payment_date >= window_start and p.payment_date < window_end)
    ),
    'subscription_statuses', coalesce((select jsonb_agg(jsonb_build_object('status', q.status, 'count', q.subscription_count) order by q.status) from (
      select s.status, count(*)::bigint as subscription_count from public.platform_subscriptions s group by s.status order by s.status limit 10
    ) q), '[]'::jsonb),
    'renewal_activity', coalesce((select jsonb_agg(jsonb_build_object('date', q.renewal_date, 'count', q.renewals) order by q.renewal_date) from (
      select s.expires_on as renewal_date, count(*)::bigint as renewals from public.platform_subscriptions s
      where s.expires_on between p_from and p_to group by s.expires_on order by s.expires_on limit 366
    ) q), '[]'::jsonb)
  ) into report;
  return report;
end;
$$;
revoke all on function public.get_platform_report(date, date) from public, anon;
grant execute on function public.get_platform_report(date, date) to authenticated;
