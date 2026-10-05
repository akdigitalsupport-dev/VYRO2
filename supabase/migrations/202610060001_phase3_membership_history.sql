-- Phase 3 extends the existing gym-scoped members and plans tables.
-- Existing tenant policies stay in place; the new history table uses the same helper.

alter table public.members add column joining_date date;
update public.members
set joining_date = coalesce(joining_date, (created_at at time zone 'Asia/Kolkata')::date);
alter table public.members alter column joining_date set default current_date;
alter table public.members alter column joining_date set not null;

create table public.member_memberships (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null,
  membership_plan_id uuid not null,
  plan_name_snapshot text not null check (char_length(trim(plan_name_snapshot)) between 1 and 120),
  duration_days_snapshot integer not null check (duration_days_snapshot > 0),
  price_snapshot numeric(12,2) not null check (price_snapshot >= 0),
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_memberships_dates_check check (end_date >= start_date),
  constraint member_memberships_member_gym_fk
    foreign key (member_id, gym_id) references public.members(id, gym_id) on delete cascade,
  constraint member_memberships_plan_gym_fk
    foreign key (membership_plan_id, gym_id) references public.membership_plans(id, gym_id) on delete restrict
);

create index member_memberships_gym_member_date_idx
  on public.member_memberships(gym_id, member_id, start_date desc, created_at desc);
create index member_memberships_gym_expiry_idx
  on public.member_memberships(gym_id, status, end_date);

-- Preserve the former current-plan fields as compatibility data while migrating
-- them into durable history. New code reads and writes member_memberships only.
insert into public.member_memberships(gym_id, member_id, membership_plan_id, plan_name_snapshot,
  duration_days_snapshot, price_snapshot, start_date, end_date, status)
select m.gym_id,
       m.id,
       m.membership_plan_id,
       p.name,
       p.duration_days,
       p.price,
       coalesce(m.membership_starts_on, m.joining_date),
       coalesce(m.membership_expires_on,
                coalesce(m.membership_starts_on, m.joining_date) + p.duration_days),
       case
         when m.archived_at is not null then 'cancelled'
         when m.status in ('expired') or coalesce(m.membership_expires_on,
              coalesce(m.membership_starts_on, m.joining_date) + p.duration_days) < current_date then 'expired'
         else 'active'
       end
from public.members m
join public.membership_plans p
  on p.id = m.membership_plan_id and p.gym_id = m.gym_id
where m.membership_plan_id is not null;

-- Member state describes the person; the original legacy status was also used
-- for membership expiry, which is now preserved in the history rows above.
alter table public.members drop constraint members_status_check;
update public.members
set status = case
  when status = 'archived' or archived_at is not null then 'archived'
  when status = 'active' then 'active'
  else 'inactive'
end;
alter table public.members add constraint members_status_check
  check (status in ('active', 'inactive', 'archived'));

create trigger member_memberships_set_updated_at before update on public.member_memberships
for each row execute function public.set_updated_at();

alter table public.member_memberships enable row level security;
revoke all on public.member_memberships from anon, authenticated;
grant select, insert, update on public.member_memberships to authenticated;
create policy "member memberships tenant access" on public.member_memberships
  for all to authenticated using (public.has_gym_access(gym_id))
  with check (public.has_gym_access(gym_id));

-- Any newly created member must have a membership row by transaction commit.
create function public.ensure_member_membership_exists()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.member_memberships mm
    where mm.member_id = new.id and mm.gym_id = new.gym_id
  ) then
    raise exception using errcode = '23514', message = 'A member requires a membership record';
  end if;
  return null;
end;
$$;
revoke all on function public.ensure_member_membership_exists() from public, anon, authenticated;
create constraint trigger members_require_membership
  after insert on public.members deferrable initially deferred
  for each row execute function public.ensure_member_membership_exists();

-- An atomic create path derives gym_id from the signed-in user's sole gym membership.
create function public.create_gym_member(
  p_member_code text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_gender text,
  p_date_of_birth date,
  p_address text,
  p_joining_date date,
  p_notes text,
  p_membership_plan_id uuid,
  p_membership_start_date date
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  gym_count integer;
  target_gym_id uuid;
  plan_duration integer;
  plan_name text;
  plan_price numeric(12,2);
  new_member_id uuid;
  gym_timezone text;
  gym_today date;
begin
  select count(*)::integer, (array_agg(m.gym_id order by m.gym_id))[1] into gym_count, target_gym_id
  from public.gym_user_memberships m
  where m.user_id = (select auth.uid()) and m.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select coalesce(gs.timezone, 'Asia/Kolkata') into gym_timezone
  from public.gym_settings gs where gs.gym_id = target_gym_id;
  gym_today := (now() at time zone coalesce(gym_timezone, 'Asia/Kolkata'))::date;
  if p_date_of_birth > gym_today then
    raise exception using errcode = '22023', message = 'Date of birth cannot be in the future';
  end if;
  if p_date_of_birth is not null and p_date_of_birth > p_joining_date then
    raise exception using errcode = '22023', message = 'Date of birth must precede joining date';
  end if;
  if p_membership_start_date < p_joining_date then
    raise exception using errcode = '22023', message = 'Membership cannot start before joining date';
  end if;

  select p.duration_days, p.name, p.price into plan_duration, plan_name, plan_price
  from public.membership_plans p
  where p.id = p_membership_plan_id and p.gym_id = target_gym_id and p.is_active;
  if plan_duration is null then
    raise exception using errcode = '42501', message = 'Membership plan is unavailable';
  end if;

  insert into public.members(
    gym_id, member_code, full_name, phone, email, gender, date_of_birth,
    address, joining_date, status, notes
  ) values (
    target_gym_id, p_member_code, p_full_name, p_phone, p_email, p_gender, p_date_of_birth,
    p_address, p_joining_date, 'active', p_notes
  ) returning id into new_member_id;

  insert into public.member_memberships(
    gym_id, member_id, membership_plan_id, plan_name_snapshot,
    duration_days_snapshot, price_snapshot, start_date, end_date, status
  ) values (
    target_gym_id, new_member_id, p_membership_plan_id, plan_name,
    plan_duration, plan_price,
    p_membership_start_date, p_membership_start_date + plan_duration, 'active'
  );
  return new_member_id;
end;
$$;
revoke all on function public.create_gym_member(text, text, text, text, text, date, text, date, text, uuid, date) from public, anon;
grant execute on function public.create_gym_member(text, text, text, text, text, date, text, date, text, uuid, date) to authenticated;

-- Membership renewals append history and expire only a previous, non-overlapping active term.
create function public.assign_member_membership(
  p_member_id uuid,
  p_membership_plan_id uuid,
  p_start_date date
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  gym_count integer;
  target_gym_id uuid;
  plan_duration integer;
  plan_name text;
  plan_price numeric(12,2);
  new_membership_id uuid;
  member_joining_date date;
begin
  select count(*)::integer, (array_agg(m.gym_id order by m.gym_id))[1] into gym_count, target_gym_id
  from public.gym_user_memberships m
  where m.user_id = (select auth.uid()) and m.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select m.joining_date into member_joining_date
  from public.members m
  where m.id = p_member_id and m.gym_id = target_gym_id and m.status <> 'archived'
  for update;
  if member_joining_date is null then
    raise exception using errcode = '42501', message = 'Member is unavailable';
  end if;
  if p_start_date < member_joining_date then
    raise exception using errcode = '22023', message = 'Membership cannot start before joining date';
  end if;

  select p.duration_days, p.name, p.price into plan_duration, plan_name, plan_price
  from public.membership_plans p
  where p.id = p_membership_plan_id and p.gym_id = target_gym_id and p.is_active;
  if plan_duration is null then
    raise exception using errcode = '42501', message = 'Membership plan is unavailable';
  end if;
  if exists (
    select 1 from public.member_memberships mm
    where mm.member_id = p_member_id and mm.gym_id = target_gym_id
      and mm.status in ('active', 'expired')
      and daterange(mm.start_date, mm.end_date, '[]')
          && daterange(p_start_date, p_start_date + plan_duration, '[]')
  ) then
    raise exception using errcode = '23P01', message = 'Membership dates overlap existing history';
  end if;

  update public.member_memberships mm set status = 'expired'
  where mm.member_id = p_member_id and mm.gym_id = target_gym_id
    and mm.status = 'active' and mm.end_date < p_start_date;
  update public.members set status = 'active'
  where id = p_member_id and gym_id = target_gym_id;
  insert into public.member_memberships(
    gym_id, member_id, membership_plan_id, plan_name_snapshot,
    duration_days_snapshot, price_snapshot, start_date, end_date, status
  ) values (
    target_gym_id, p_member_id, p_membership_plan_id, plan_name,
    plan_duration, plan_price,
    p_start_date, p_start_date + plan_duration, 'active'
  ) returning id into new_membership_id;
  return new_membership_id;
end;
$$;
revoke all on function public.assign_member_membership(uuid, uuid, date) from public, anon;
grant execute on function public.assign_member_membership(uuid, uuid, date) to authenticated;

-- Paginated member listing resolves only the latest membership and never accepts a gym ID.
create function public.get_gym_member_directory(
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
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select coalesce(gs.timezone, 'Asia/Kolkata') into gym_timezone
  from public.gym_settings gs where gs.gym_id = target_gym_id;
  gym_today := (now() at time zone coalesce(gym_timezone, 'Asia/Kolkata'))::date;
  if p_page_size < 1 or p_page_size > 100 or p_page_offset < 0 then
    raise exception using errcode = '22023', message = 'Invalid page range';
  end if;
  if p_member_status is not null and p_member_status not in ('active', 'inactive', 'archived') then
    raise exception using errcode = '22023', message = 'Invalid member status';
  end if;
  if p_membership_status is not null and p_membership_status not in ('active', 'expiring', 'expired', 'cancelled', 'none') then
    raise exception using errcode = '22023', message = 'Invalid membership status';
  end if;

  return query
  with effective as (
    select m.id, m.gym_id, m.member_code, m.full_name, m.phone, m.status as member_status,
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
      from public.member_memberships mm
      where mm.member_id = m.id and mm.gym_id = m.gym_id
      order by mm.start_date desc, mm.created_at desc, mm.id desc
      limit 1
    ) latest on true
    where m.gym_id = target_gym_id
      and (p_member_status is null and m.status <> 'archived' or m.status = p_member_status)
      and (nullif(trim(p_search), '') is null
        or position(lower(trim(p_search)) in lower(m.full_name)) > 0
        or position(lower(trim(p_search)) in lower(m.member_code)) > 0
        or position(lower(trim(p_search)) in lower(coalesce(m.phone, ''))) > 0)
  ), filtered as (
    select e.* from effective e
    where p_membership_status is null or e.membership_status = p_membership_status
  ), page as (
    select * from filtered order by full_name, id limit p_page_size offset p_page_offset
  )
  select (select count(*) from filtered),
    coalesce((select jsonb_agg(to_jsonb(page_row) order by page_row.full_name, page_row.id) from page page_row), '[]'::jsonb);
end;
$$;
revoke all on function public.get_gym_member_directory(text, text, text, integer, integer) from public, anon;
grant execute on function public.get_gym_member_directory(text, text, text, integer, integer) to authenticated;

-- Distinguish archive and plan activation events in the existing audit stream.
create or replace function public.write_audit_event()
returns trigger language plpgsql set search_path = '' as $$
declare
  target_gym_id uuid;
  target_entity_id uuid;
  audit_action text;
  audit_entity text;
  audit_metadata jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'gyms' then
    target_gym_id := new.id;
  elsif tg_table_name = 'platform_settings' then
    target_gym_id := null;
  else
    target_gym_id := new.gym_id;
  end if;
  if tg_table_name = 'platform_settings' then
    target_entity_id := null;
  elsif tg_table_name = 'gym_settings' then
    target_entity_id := new.gym_id;
  else
    target_entity_id := new.id;
  end if;

  if tg_table_name = 'gyms' then
    audit_action := case when tg_op = 'INSERT' then 'gym.created' else 'gym.updated' end;
    audit_entity := 'gym';
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      audit_action := 'gym.status_changed';
      audit_metadata := jsonb_build_object('from', old.status, 'to', new.status);
    end if;
  elsif tg_table_name = 'platform_subscriptions' then
    audit_action := case when tg_op = 'INSERT' then 'subscription.created' else 'subscription.updated' end;
    audit_entity := 'platform_subscription';
  elsif tg_table_name = 'platform_subscription_payments' then
    audit_action := 'platform_payment.recorded';
    audit_entity := 'platform_subscription_payment';
  elsif tg_table_name = 'membership_plans' then
    audit_entity := 'membership_plan';
    if tg_op = 'INSERT' then
      audit_action := 'membership_plan.created';
    elsif new.is_active is distinct from old.is_active then
      audit_action := case when new.is_active then 'membership_plan.activated' else 'membership_plan.deactivated' end;
      audit_metadata := jsonb_build_object('from', old.is_active, 'to', new.is_active);
    else
      audit_action := 'membership_plan.updated';
    end if;
  elsif tg_table_name = 'members' then
    audit_entity := 'member';
    if tg_op = 'INSERT' then
      audit_action := 'member.created';
    elsif new.status = 'archived' and old.status is distinct from 'archived' then
      audit_action := 'member.archived';
      audit_metadata := jsonb_build_object('from', old.status, 'to', new.status);
    else
      audit_action := 'member.updated';
    end if;
  elsif tg_table_name = 'member_memberships' then
    audit_entity := 'member_membership';
    if tg_op = 'INSERT' then
      audit_action := 'membership.created';
    elsif new.status is distinct from old.status then
      audit_action := 'membership.changed';
      audit_metadata := jsonb_build_object('from', old.status, 'to', new.status);
    else
      audit_action := 'membership.updated';
    end if;
  elsif tg_table_name = 'attendance_records' then
    audit_action := 'attendance.checked_in';
    audit_entity := 'attendance_record';
  elsif tg_table_name = 'member_payments' then
    audit_action := 'member_payment.recorded';
    audit_entity := 'member_payment';
  elsif tg_table_name = 'gym_settings' then
    audit_action := case when tg_op = 'INSERT' then 'gym_settings.created' else 'gym_settings.updated' end;
    audit_entity := 'gym_settings';
  else
    audit_action := 'platform_settings.updated';
    audit_entity := 'platform_setting';
  end if;

  insert into public.audit_logs(actor_user_id, gym_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), target_gym_id, audit_action, audit_entity, target_entity_id, audit_metadata);
  return new;
end;
$$;

create trigger member_memberships_audit_event after insert or update on public.member_memberships
for each row execute function public.write_audit_event();

-- Replace the gym summary's membership counters with history-based counts.
drop function public.get_gym_dashboard_summary(uuid);
create function public.get_gym_dashboard_summary(target_gym_id uuid)
returns table (
  total_members bigint,
  active_members bigint,
  expiring_members bigint,
  expired_members bigint,
  today_attendance bigint,
  month_revenue numeric
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  gym_timezone text;
  gym_today date;
begin
  if not exists (
    select 1 from public.gym_user_memberships m
    where m.user_id = (select auth.uid())
      and m.gym_id = target_gym_id
      and m.role = 'gym_admin'
  ) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  select coalesce(gs.timezone, 'Asia/Kolkata') into gym_timezone
  from public.gym_settings gs where gs.gym_id = target_gym_id;
  gym_timezone := coalesce(gym_timezone, 'Asia/Kolkata');
  gym_today := (now() at time zone gym_timezone)::date;

  return query
  with latest_membership as (
    select distinct on (mm.member_id)
      mm.member_id, mm.status, mm.start_date, mm.end_date
    from public.member_memberships mm
    where mm.gym_id = target_gym_id
    order by mm.member_id, mm.start_date desc, mm.created_at desc, mm.id desc
  )
  select
    (select count(*) from public.members m where m.gym_id = target_gym_id and m.archived_at is null),
    (select count(*) from public.members m where m.gym_id = target_gym_id and m.status = 'active' and m.archived_at is null),
    (select count(*) from latest_membership lm
      where lm.status = 'active' and lm.end_date >= gym_today and lm.end_date <= gym_today + 30),
    (select count(*) from latest_membership lm
      where lm.status = 'expired' or (lm.status = 'active' and lm.end_date < gym_today)),
    (select count(*) from public.attendance_records a where a.gym_id = target_gym_id
      and a.checked_in_at >= (gym_today::timestamp at time zone gym_timezone)
      and a.checked_in_at < ((gym_today + 1)::timestamp at time zone gym_timezone)),
    (select coalesce(sum(p.amount), 0) from public.member_payments p
      where p.gym_id = target_gym_id and p.status = 'paid'
        and p.paid_at >= date_trunc('month', now() at time zone gym_timezone)::timestamp at time zone gym_timezone
        and p.paid_at < (date_trunc('month', now() at time zone gym_timezone) + interval '1 month')::timestamp at time zone gym_timezone);
end;
$$;
revoke all on function public.get_gym_dashboard_summary(uuid) from public, anon;
grant execute on function public.get_gym_dashboard_summary(uuid) to authenticated;
