-- Keep archived_at authoritative in the normal and archived directory views.
create or replace function public.get_gym_member_directory(
  p_search text default null,
  p_member_status text default null,
  p_membership_status text default null,
  p_page_size integer default 25,
  p_page_offset integer default 0
)
returns table(total_count bigint, rows jsonb)
language plpgsql stable security invoker set search_path = '' as $$
declare
  gym_count integer;
  target_gym_id uuid;
  gym_timezone text;
  gym_today date;
begin
  select count(*)::integer, (array_agg(m.gym_id order by m.gym_id))[1] into gym_count, target_gym_id
  from public.gym_user_memberships m
  where m.user_id = (select auth.uid()) and m.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then raise exception using errcode = '42501', message = 'Not authorized'; end if;
  select coalesce(gs.timezone, 'Asia/Kolkata') into gym_timezone from public.gym_settings gs where gs.gym_id = target_gym_id;
  gym_today := (now() at time zone coalesce(gym_timezone, 'Asia/Kolkata'))::date;
  if p_page_size < 1 or p_page_size > 100 or p_page_offset < 0 then raise exception using errcode = '22023', message = 'Invalid page range'; end if;
  if p_member_status is not null and p_member_status not in ('active', 'inactive', 'archived') then raise exception using errcode = '22023', message = 'Invalid member status'; end if;
  if p_membership_status is not null and p_membership_status not in ('active', 'expiring', 'expired', 'cancelled', 'none') then raise exception using errcode = '22023', message = 'Invalid membership status'; end if;

  return query
  with effective as (
    select m.id, m.gym_id, m.member_code, m.full_name, m.phone,
      case when m.status = 'archived' or m.archived_at is not null then 'archived' else m.status end as member_status,
      m.joining_date, latest.membership_plan_id, latest.plan_name_snapshot as plan_name,
      latest.start_date, latest.end_date,
      case
        when latest.id is null then 'none'
        when latest.status = 'active' and latest.end_date < gym_today then 'expired'
        when latest.status = 'active' and latest.end_date <= gym_today + 30 then 'expiring'
        else latest.status
      end as membership_status
    from public.members m
    left join lateral (
      select mm.id, mm.membership_plan_id, mm.plan_name_snapshot, mm.start_date, mm.end_date, mm.status
      from public.member_memberships mm where mm.member_id = m.id and mm.gym_id = m.gym_id
      order by mm.start_date desc, mm.created_at desc, mm.id desc limit 1
    ) latest on true
    where m.gym_id = target_gym_id
      and case
        when p_member_status = 'archived' then (m.status = 'archived' or m.archived_at is not null)
        when p_member_status in ('active', 'inactive') then m.status = p_member_status and m.status <> 'archived' and m.archived_at is null
        else m.status <> 'archived' and m.archived_at is null
      end
      and (nullif(trim(p_search), '') is null
        or position(lower(trim(p_search)) in lower(m.full_name)) > 0
        or position(lower(trim(p_search)) in lower(m.member_code)) > 0
        or position(lower(trim(p_search)) in lower(coalesce(m.phone, ''))) > 0)
  ), filtered as (
    select e.* from effective e where p_membership_status is null or e.membership_status = p_membership_status
  ), page as (select * from filtered order by full_name, id limit p_page_size offset p_page_offset)
  select (select count(*) from filtered),
    coalesce((select jsonb_agg(to_jsonb(page_row) order by page_row.full_name, page_row.id) from page page_row), '[]'::jsonb);
end;
$$;
revoke all on function public.get_gym_member_directory(text, text, text, integer, integer) from public, anon;
grant execute on function public.get_gym_member_directory(text, text, text, integer, integer) to authenticated;
