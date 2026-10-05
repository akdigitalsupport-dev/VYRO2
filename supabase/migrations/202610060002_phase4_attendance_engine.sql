-- Phase 4 extends the existing attendance table and preserves its tenant RLS policy.
-- The stored attendance date is computed in the gym's timezone at check-in time.

alter table public.attendance_records add column attendance_date date;
update public.attendance_records a
set attendance_date = (a.checked_in_at at time zone coalesce(gs.timezone, 'Asia/Kolkata'))::date
from public.gym_settings gs
where gs.gym_id = a.gym_id and a.attendance_date is null;
update public.attendance_records a
set attendance_date = (a.checked_in_at at time zone 'Asia/Kolkata')::date
where a.attendance_date is null;
alter table public.attendance_records alter column attendance_date set not null;

-- Existing time indexes remain useful for member history and timestamp ranges.
create index attendance_gym_day_time_idx
  on public.attendance_records(gym_id, attendance_date, checked_in_at desc);
create unique index attendance_one_per_member_day_idx
  on public.attendance_records(gym_id, member_id, attendance_date);

-- Validate all insert paths, including direct PostgREST writes, with the same tenant,
-- member-state, and membership rules as the authenticated check-in RPC.
create function public.validate_attendance_checkin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  gym_timezone text;
  local_day date;
begin
  if not exists (
    select 1 from public.gym_user_memberships m
    where m.user_id = (select auth.uid())
      and m.gym_id = new.gym_id and m.role = 'gym_admin'
  ) then
    raise exception using errcode = '42501', message = 'Not authorized to check in members for this gym';
  end if;

  select coalesce(gs.timezone, 'Asia/Kolkata') into gym_timezone
  from public.gym_settings gs where gs.gym_id = new.gym_id;
  gym_timezone := coalesce(gym_timezone, 'Asia/Kolkata');
  new.checked_in_at := now();
  local_day := (new.checked_in_at at time zone gym_timezone)::date;
  new.attendance_date := local_day;
  new.source := 'manual';
  new.recorded_by := (select auth.uid());

  if not exists (
    select 1 from public.members m
    where m.id = new.member_id and m.gym_id = new.gym_id
      and m.status = 'active' and m.archived_at is null
  ) then
    raise exception using errcode = '42501', message = 'Member is unavailable';
  end if;
  if not exists (
    select 1 from public.member_memberships mm
    where mm.member_id = new.member_id and mm.gym_id = new.gym_id
      and mm.status = 'active' and mm.start_date <= local_day and mm.end_date >= local_day
  ) then
    raise exception using errcode = '23514', message = 'Membership is not currently valid';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_attendance_checkin() from public, anon, authenticated;

create trigger attendance_validate_checkin
before insert on public.attendance_records
for each row execute function public.validate_attendance_checkin();

-- The member and gym are resolved from the signed-in user's gym-admin membership;
-- the RPC accepts no client-supplied gym ID and reports duplicate check-ins cleanly.
create function public.check_in_member(p_member_id uuid, p_notes text default null)
returns table(outcome text, attendance_id uuid)
language plpgsql security invoker set search_path = '' as $$
declare
  gym_count integer;
  target_gym_id uuid;
  gym_timezone text;
  gym_today date;
  member_status text;
  created_id uuid;
begin
  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception using errcode = '22023', message = 'Check-in note is too long';
  end if;
  select count(*)::integer, (array_agg(m.gym_id order by m.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships m
  where m.user_id = (select auth.uid()) and m.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  select coalesce(gs.timezone, 'Asia/Kolkata') into gym_timezone
  from public.gym_settings gs where gs.gym_id = target_gym_id;
  gym_today := (now() at time zone coalesce(gym_timezone, 'Asia/Kolkata'))::date;
  select m.status into member_status
  from public.members m
  where m.id = p_member_id and m.gym_id = target_gym_id and m.archived_at is null;
  if member_status is distinct from 'active' then
    return query select 'member_unavailable'::text, null::uuid;
    return;
  end if;
  if not exists (
    select 1 from public.member_memberships mm
    where mm.member_id = p_member_id and mm.gym_id = target_gym_id
      and mm.status = 'active' and mm.start_date <= gym_today and mm.end_date >= gym_today
  ) then
    return query select 'membership_invalid'::text, null::uuid;
    return;
  end if;

  insert into public.attendance_records(gym_id, member_id, notes)
  values (target_gym_id, p_member_id, nullif(trim(p_notes), ''))
  on conflict (gym_id, member_id, attendance_date) do nothing
  returning id into created_id;
  if created_id is null then
    return query select 'already_checked_in'::text, null::uuid;
  else
    return query select 'checked_in'::text, created_id;
  end if;
end;
$$;
revoke all on function public.check_in_member(uuid, text) from public, anon;
grant execute on function public.check_in_member(uuid, text) to authenticated;

-- Attendance is append-only for gym admins. Existing SELECT RLS remains authoritative;
-- inserts still pass through RLS and the validation trigger above.
revoke update, delete on public.attendance_records from authenticated;

create function public.get_gym_attendance_summary(p_attendance_date date)
returns table(total_check_ins bigint, unique_check_ins bigint)
language plpgsql stable security invoker set search_path = '' as $$
declare
  gym_count integer;
  target_gym_id uuid;
begin
  select count(*)::integer, (array_agg(m.gym_id order by m.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships m
  where m.user_id = (select auth.uid()) and m.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  return query
  select count(*)::bigint, count(distinct a.member_id)::bigint
  from public.attendance_records a
  where a.gym_id = target_gym_id and a.attendance_date = p_attendance_date;
end;
$$;
revoke all on function public.get_gym_attendance_summary(date) from public, anon;
grant execute on function public.get_gym_attendance_summary(date) to authenticated;
