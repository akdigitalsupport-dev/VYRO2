-- Public QR self-check-in. Existing members are deliberately not backfilled by
-- this migration; a gym admin starts code assignment explicitly.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.member_checkin_codes (
  member_id uuid primary key,
  gym_id uuid not null,
  check_in_code text not null check (check_in_code ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  constraint member_checkin_codes_member_gym_fk
    foreign key (member_id, gym_id) references public.members(id, gym_id) on delete cascade,
  constraint member_checkin_codes_gym_code_unique unique (gym_id, check_in_code)
);

alter table private.member_checkin_codes enable row level security;
revoke all on private.member_checkin_codes from public, anon, authenticated, service_role;

create table private.qr_checkin_rate_limits (
  gym_id uuid not null,
  client_key_hash text not null check (client_key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (gym_id, client_key_hash)
);
create index qr_checkin_rate_limits_updated_at_idx
  on private.qr_checkin_rate_limits(updated_at);
alter table private.qr_checkin_rate_limits enable row level security;
revoke all on private.qr_checkin_rate_limits from public, anon, authenticated, service_role;

-- Serialize code assignment per gym so the one-time bulk action and new member
-- enrollment cannot allocate the same four-digit code concurrently.
create function private.assign_member_checkin_code(p_member_id uuid, p_gym_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_code text;
begin
  perform 1 from public.gyms g where g.id = p_gym_id for update;
  if not found then raise exception using errcode = '23503', message = 'Gym is unavailable'; end if;

  if exists (
    select 1 from private.member_checkin_codes c where c.member_id = p_member_id
  ) then return; end if;

  select lpad(n::text, 4, '0') into candidate_code
  from generate_series(0, 9999) n
  where not exists (
    select 1 from private.member_checkin_codes c
    where c.gym_id = p_gym_id and c.check_in_code = lpad(n::text, 4, '0')
  )
  order by gen_random_uuid()
  limit 1;
  if candidate_code is null then
    raise exception using errcode = '23514', message = 'Four-digit member ID capacity reached';
  end if;

  insert into private.member_checkin_codes(member_id, gym_id, check_in_code)
  values (p_member_id, p_gym_id, candidate_code);
end;
$$;
revoke all on function private.assign_member_checkin_code(uuid, uuid) from public, anon, authenticated, service_role;

create function private.assign_new_member_checkin_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and new.archived_at is null then
    perform private.assign_member_checkin_code(new.id, new.gym_id);
  end if;
  return new;
end;
$$;
revoke all on function private.assign_new_member_checkin_code() from public, anon, authenticated, service_role;

create trigger members_assign_checkin_code_after_insert
after insert on public.members
for each row execute function private.assign_new_member_checkin_code();

create trigger members_assign_checkin_code_after_activation
after update of status, archived_at on public.members
for each row when (new.status = 'active' and new.archived_at is null)
execute function private.assign_new_member_checkin_code();

create function public.generate_gym_checkin_codes()
returns table(assigned_count integer, assigned_total integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  gym_count integer;
  target_gym_id uuid;
  missing_count integer;
  available_count integer;
  changed_count integer;
begin
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = caller_id and gum.role = 'gym_admin';
  if caller_id is null or gym_count <> 1 or target_gym_id is null or not exists (
    select 1 from public.user_profiles up where up.user_id = caller_id and up.role = 'gym_admin'
  ) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  perform 1 from public.gyms g where g.id = target_gym_id for update;
  select count(*)::integer into missing_count
  from public.members m
  where m.gym_id = target_gym_id and m.status = 'active' and m.archived_at is null
    and not exists (select 1 from private.member_checkin_codes c where c.member_id = m.id);
  select 10000 - count(*)::integer into available_count
  from private.member_checkin_codes c where c.gym_id = target_gym_id;

  if missing_count > available_count then
    raise exception using errcode = '23514', message = 'Four-digit member ID capacity reached; no codes were assigned';
  end if;

  with missing_members as (
    select m.id, row_number() over (order by m.id) as ordinal
    from public.members m
    where m.gym_id = target_gym_id and m.status = 'active' and m.archived_at is null
      and not exists (select 1 from private.member_checkin_codes c where c.member_id = m.id)
  ), available_codes as (
    select lpad(n::text, 4, '0') as code,
      row_number() over (order by gen_random_uuid()) as ordinal
    from generate_series(0, 9999) n
    where not exists (
      select 1 from private.member_checkin_codes c
      where c.gym_id = target_gym_id and c.check_in_code = lpad(n::text, 4, '0')
    )
    order by ordinal
    limit missing_count
  )
  insert into private.member_checkin_codes(member_id, gym_id, check_in_code)
  select mm.id, target_gym_id, ac.code
  from missing_members mm join available_codes ac using (ordinal);
  get diagnostics changed_count = row_count;

  return query select changed_count,
    (select count(*)::integer from private.member_checkin_codes c
      join public.members m on m.id = c.member_id and m.gym_id = c.gym_id
      where c.gym_id = target_gym_id and m.status = 'active' and m.archived_at is null);
end;
$$;
revoke all on function public.generate_gym_checkin_codes() from public, anon;
grant execute on function public.generate_gym_checkin_codes() to authenticated;

create function public.get_gym_checkin_code_summary()
returns table(active_members integer, assigned_codes integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_gym_id uuid;
begin
  select gum.gym_id into target_gym_id
  from public.gym_user_memberships gum
  join public.user_profiles up on up.user_id = gum.user_id and up.role = 'gym_admin'
  where gum.user_id = caller_id and gum.role = 'gym_admin';
  if caller_id is null or target_gym_id is null or (
    select count(*) from public.gym_user_memberships gum
    where gum.user_id = caller_id and gum.role = 'gym_admin'
  ) <> 1 then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  return query
  select count(*)::integer,
    count(c.member_id)::integer
  from public.members m
  left join private.member_checkin_codes c on c.member_id = m.id and c.gym_id = m.gym_id
  where m.gym_id = target_gym_id and m.status = 'active' and m.archived_at is null;
end;
$$;
revoke all on function public.get_gym_checkin_code_summary() from public, anon;
grant execute on function public.get_gym_checkin_code_summary() to authenticated;

create function public.get_gym_checkin_codes(p_page_size integer default 500, p_page_offset integer default 0)
returns table(full_name text, check_in_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_gym_id uuid;
begin
  select gum.gym_id into target_gym_id
  from public.gym_user_memberships gum
  join public.user_profiles up on up.user_id = gum.user_id and up.role = 'gym_admin'
  where gum.user_id = caller_id and gum.role = 'gym_admin';
  if caller_id is null or target_gym_id is null or (
    select count(*) from public.gym_user_memberships gum
    where gum.user_id = caller_id and gum.role = 'gym_admin'
  ) <> 1 then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_page_size < 1 or p_page_size > 500 or p_page_offset < 0 or p_page_offset > 10000 then
    raise exception using errcode = '22023', message = 'Invalid page';
  end if;
  return query
  select m.full_name, c.check_in_code
  from public.members m
  join private.member_checkin_codes c on c.member_id = m.id and c.gym_id = m.gym_id
  where m.gym_id = target_gym_id and m.status = 'active' and m.archived_at is null
  order by m.full_name, m.id
  limit p_page_size offset p_page_offset;
end;
$$;
revoke all on function public.get_gym_checkin_codes(integer, integer) from public, anon;
grant execute on function public.get_gym_checkin_codes(integer, integer) to authenticated;

create function public.get_public_gym_checkin_branding(p_gym_id uuid)
returns table(gym_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select g.name
  from public.gyms g
  where g.id = p_gym_id and g.status in ('active', 'expiring')
$$;
revoke all on function public.get_public_gym_checkin_branding(uuid) from public;
grant execute on function public.get_public_gym_checkin_branding(uuid) to anon, authenticated;

-- The public web route derives a keyed client hash from the request IP and the
-- existing server-only Supabase secret. Only the service role can call this RPC.
create function public.check_in_member_public(
  p_gym_id uuid,
  p_check_in_code text,
  p_client_key_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_attempts integer;
  gym_timezone text;
  local_day date;
  target_member_id uuid;
  attendance_id uuid;
begin
  if p_gym_id is null or p_client_key_hash !~ '^[0-9a-f]{64}$' then
    return 'unavailable';
  end if;

  insert into private.qr_checkin_rate_limits(gym_id, client_key_hash, window_started_at, attempt_count, updated_at)
  values (p_gym_id, p_client_key_hash, now(), 1, now())
  on conflict (gym_id, client_key_hash) do update
    set attempt_count = case
          when private.qr_checkin_rate_limits.window_started_at < now() - interval '1 minute' then 1
          else private.qr_checkin_rate_limits.attempt_count + 1
        end,
        window_started_at = case
          when private.qr_checkin_rate_limits.window_started_at < now() - interval '1 minute' then now()
          else private.qr_checkin_rate_limits.window_started_at
        end,
        updated_at = now()
  returning attempt_count into current_attempts;

  delete from private.qr_checkin_rate_limits r where r.updated_at < now() - interval '2 days';
  if current_attempts > 10 or p_check_in_code is null or p_check_in_code !~ '^[0-9]{4}$' then
    return 'unavailable';
  end if;

  select coalesce(gs.timezone, 'Asia/Kolkata') into gym_timezone
  from public.gyms g
  left join public.gym_settings gs on gs.gym_id = g.id
  where g.id = p_gym_id and g.status in ('active', 'expiring');
  if not found then return 'unavailable'; end if;
  local_day := (now() at time zone coalesce(gym_timezone, 'Asia/Kolkata'))::date;

  select c.member_id into target_member_id
  from private.member_checkin_codes c
  where c.gym_id = p_gym_id and c.check_in_code = p_check_in_code;
  if target_member_id is null then return 'unavailable'; end if;

  perform 1 from public.members m
  where m.id = target_member_id and m.gym_id = p_gym_id
    and m.status = 'active' and m.archived_at is null
  for update;
  if not found then return 'unavailable'; end if;

  if not exists (
    select 1 from public.member_memberships mm
    where mm.member_id = target_member_id and mm.gym_id = p_gym_id
      and mm.status = 'active' and mm.start_date <= local_day and mm.end_date >= local_day
  ) then return 'unavailable'; end if;

  perform set_config('vyro.qr_checkin', 'on', true);
  insert into public.attendance_records(gym_id, member_id, source, recorded_by, notes)
  values (p_gym_id, target_member_id, 'qr', null, null)
  on conflict (gym_id, member_id, attendance_date) do nothing
  returning id into attendance_id;
  if attendance_id is null then return 'unavailable'; end if;
  return 'checked_in';
end;
$$;
revoke all on function public.check_in_member_public(uuid, text, text) from public, anon, authenticated;
grant execute on function public.check_in_member_public(uuid, text, text) to service_role;

-- Keep staff check-ins unchanged. Only the server-only QR RPC can set the
-- transaction-local marker that allows the public QR source through the trigger.
create or replace function public.validate_attendance_checkin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym_timezone text;
  local_day date;
  trusted_qr boolean := new.source = 'qr' and current_setting('vyro.qr_checkin', true) = 'on';
begin
  if not trusted_qr and not exists (
    select 1 from public.gym_user_memberships gum
    where gum.user_id = (select auth.uid())
      and gum.gym_id = new.gym_id and gum.role = 'gym_admin'
  ) then
    raise exception using errcode = '42501', message = 'Not authorized to check in members for this gym';
  end if;

  select coalesce(gs.timezone, 'Asia/Kolkata') into gym_timezone
  from public.gym_settings gs where gs.gym_id = new.gym_id;
  gym_timezone := coalesce(gym_timezone, 'Asia/Kolkata');
  new.checked_in_at := now();
  local_day := (new.checked_in_at at time zone gym_timezone)::date;
  new.attendance_date := local_day;
  if trusted_qr then
    new.source := 'qr';
    new.recorded_by := null;
  else
    new.source := 'manual';
    new.recorded_by := (select auth.uid());
  end if;

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
