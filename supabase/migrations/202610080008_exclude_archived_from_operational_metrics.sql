begin;

create or replace function public.get_gym_dashboard_summary(target_gym_id uuid)
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
    from public.member_memberships mm
    join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
    where mm.gym_id = target_gym_id and m.status <> 'archived' and m.archived_at is null
    order by mm.member_id, mm.start_date desc, mm.created_at desc, mm.id desc
  )
  select
    (select count(*) from public.members m where m.gym_id = target_gym_id and m.status <> 'archived' and m.archived_at is null),
    (select count(*) from public.members m where m.gym_id = target_gym_id and m.status = 'active' and m.archived_at is null),
    (select count(*) from latest_membership lm where lm.status = 'active' and lm.end_date >= gym_today and lm.end_date <= gym_today + 30),
    (select count(*) from latest_membership lm where lm.status = 'expired' or (lm.status = 'active' and lm.end_date < gym_today)),
    (select count(*) from public.attendance_records a
      join public.members m on m.id = a.member_id and m.gym_id = a.gym_id
      where a.gym_id = target_gym_id and m.status <> 'archived' and m.archived_at is null
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

create or replace function public.get_gym_report(target_gym_id uuid, p_from date, p_to date)
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
    from public.member_memberships mm
    join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
    where mm.gym_id = target_gym_id and m.status <> 'archived' and m.archived_at is null
    order by mm.member_id, mm.start_date desc, mm.created_at desc, mm.id desc
  ),
  daily_attendance as (
    select a.attendance_date as day, count(*)::bigint as check_ins, count(distinct a.member_id)::bigint as unique_members
    from public.attendance_records a
    join public.members m on m.id = a.member_id and m.gym_id = a.gym_id
    where a.gym_id = target_gym_id and m.status <> 'archived' and m.archived_at is null and a.attendance_date between p_from and p_to
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
      'total', (select count(*) from public.members m where m.gym_id = target_gym_id and m.status <> 'archived' and m.archived_at is null),
      'active', (select count(*) from public.members m where m.gym_id = target_gym_id and m.archived_at is null and m.status = 'active'),
      'inactive', (select count(*) from public.members m where m.gym_id = target_gym_id and m.archived_at is null and m.status = 'inactive'),
      'new_in_period', (select count(*) from public.members m where m.gym_id = target_gym_id and m.status <> 'archived' and m.archived_at is null and m.joining_date between p_from and p_to)
    ),
    'memberships', jsonb_build_object(
      'active', (select count(*) from latest_membership lm where lm.status = 'active' and lm.start_date <= today_local and lm.end_date >= today_local),
      'expiring', (select count(*) from latest_membership lm where lm.status = 'active' and lm.start_date <= today_local and lm.end_date between today_local and today_local + 30),
      'expired', (select count(*) from latest_membership lm where lm.status = 'expired' or (lm.status = 'active' and lm.end_date < today_local)),
      'renewals_in_period', (select count(*) from public.member_memberships mm
        join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
        where mm.gym_id = target_gym_id and m.status <> 'archived' and m.archived_at is null
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
      'total_check_ins', (select count(*) from public.attendance_records a
        join public.members m on m.id = a.member_id and m.gym_id = a.gym_id
        where a.gym_id = target_gym_id and m.status <> 'archived' and m.archived_at is null and a.attendance_date between p_from and p_to),
      'unique_members', (select count(distinct a.member_id) from public.attendance_records a
        join public.members m on m.id = a.member_id and m.gym_id = a.gym_id
        where a.gym_id = target_gym_id and m.status <> 'archived' and m.archived_at is null and a.attendance_date between p_from and p_to),
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

commit;
