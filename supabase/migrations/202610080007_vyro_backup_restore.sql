begin;

-- Restore is a single database transaction. The tenant is derived from the
-- authenticated gym-admin membership; tenant IDs in the uploaded file are never
-- used as authorization input.
create or replace function public.restore_gym_operational_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  gym_count integer;
  target_gym_id uuid;
  data jsonb;
  row_json jsonb;
  source_status text;
  restored_members integer := 0;
  restored_plans integer := 0;
  restored_memberships integer := 0;
  restored_payments integer := 0;
  restored_attendance integer := 0;
  restored_trainers integer := 0;
  restored_expenses integer := 0;
  restored_preferences integer := 0;
  row_id uuid;
begin
  if caller_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = caller_id and gum.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if jsonb_typeof(p_backup) is distinct from 'object'
    or p_backup #>> '{manifest,format}' is distinct from 'VYRO'
    or p_backup #>> '{manifest,version}' is distinct from '1'
    or p_backup #>> '{manifest,gym_id}' is distinct from target_gym_id::text
    or jsonb_typeof(p_backup->'data') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Backup format or gym does not match';
  end if;
  data := p_backup->'data';
  if jsonb_typeof(data->'gym') is distinct from 'object' or jsonb_typeof(data->'settings') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Backup gym settings are invalid';
  end if;
  if (data #>> '{gym,id}') <> target_gym_id::text or (data #>> '{settings,gym_id}') <> target_gym_id::text then
    raise exception using errcode = '42501', message = 'Backup gym does not match the authenticated gym';
  end if;

  if coalesce((select bool_and(jsonb_typeof(data->key) = 'array') from unnest(array[
      'members','plans','memberships','payments','attendance','trainers','expenses','notification_preferences'
    ]) as key), false) is not true then
    raise exception using errcode = '22023', message = 'Backup record collections are invalid';
  end if;

  -- Fail before writes if the backup collides with existing primary IDs or member codes.
  if exists (select 1 from jsonb_array_elements(data->'members') r where exists (
      select 1 from public.members m where m.id = (r->>'id')::uuid or
        (m.gym_id = target_gym_id and m.member_code = r->>'member_code')
    )) or exists (select 1 from jsonb_array_elements(data->'plans') r where exists (
      select 1 from public.membership_plans p where p.id = (r->>'id')::uuid
    )) or exists (select 1 from jsonb_array_elements(data->'memberships') r where exists (
      select 1 from public.member_memberships mm where mm.id = (r->>'id')::uuid
    )) or exists (select 1 from jsonb_array_elements(data->'payments') r where exists (
      select 1 from public.member_payments p where p.id = (r->>'id')::uuid
    )) or exists (select 1 from jsonb_array_elements(data->'attendance') r where exists (
      select 1 from public.attendance_records a where a.id = (r->>'id')::uuid
    )) or exists (select 1 from jsonb_array_elements(data->'trainers') r where exists (
      select 1 from public.trainers t where t.id = (r->>'id')::uuid
    )) or exists (select 1 from jsonb_array_elements(data->'expenses') r where exists (
      select 1 from public.gym_expenses e where e.id = (r->>'id')::uuid
    )) or exists (select 1 from jsonb_array_elements(data->'notification_preferences') r where exists (
      select 1 from public.notification_preferences np where np.id = (r->>'id')::uuid
    )) then
    raise exception using errcode = '23505', message = 'Backup IDs already exist in this gym';
  end if;

  -- Validate tenant ownership and references independently of browser validation.
  if exists (select 1 from jsonb_array_elements(data->'members') r
      where coalesce(r->>'gym_id', target_gym_id::text) <> target_gym_id::text
        or r->>'status' = 'archived' or r->>'archived_at' is not null)
    or exists (select 1 from jsonb_array_elements(data->'plans') r where coalesce(r->>'gym_id', target_gym_id::text) <> target_gym_id::text)
    or exists (select 1 from jsonb_array_elements(data->'memberships') r
      where coalesce(r->>'gym_id', target_gym_id::text) <> target_gym_id::text
        or not exists (select 1 from jsonb_array_elements(data->'members') m where m->>'id' = r->>'member_id')
        or not exists (select 1 from jsonb_array_elements(data->'plans') p where p->>'id' = r->>'membership_plan_id'))
    or exists (select 1 from jsonb_array_elements(data->'payments') r
      where coalesce(r->>'gym_id', target_gym_id::text) <> target_gym_id::text
        or not exists (select 1 from jsonb_array_elements(data->'members') m where m->>'id' = r->>'member_id')
        or (r->>'membership_id' is not null and not exists (
          select 1 from jsonb_array_elements(data->'memberships') mm where mm->>'id' = r->>'membership_id'
        ))
        or coalesce(r->>'status','') not in ('completed','refunded'))
    or exists (select 1 from jsonb_array_elements(data->'attendance') r
      where coalesce(r->>'gym_id', target_gym_id::text) <> target_gym_id::text
        or not exists (select 1 from jsonb_array_elements(data->'members') m where m->>'id' = r->>'member_id'))
    or exists (select 1 from jsonb_array_elements(data->'trainers') r where coalesce(r->>'gym_id', target_gym_id::text) <> target_gym_id::text)
    or exists (select 1 from jsonb_array_elements(data->'expenses') r where coalesce(r->>'gym_id', target_gym_id::text) <> target_gym_id::text)
    or exists (select 1 from jsonb_array_elements(data->'notification_preferences') r
      where coalesce(r->>'gym_id', target_gym_id::text) <> target_gym_id::text or r->>'audience' <> 'gym') then
    raise exception using errcode = '42501', message = 'Backup contains records outside the gym or broken references';
  end if;

  if nullif(data #>> '{settings,timezone}', '') is null
    or not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = data #>> '{settings,timezone}')
    or coalesce(data #>> '{settings,currency}', '') !~ '^[A-Z]{3}$' then
    raise exception using errcode = '22023', message = 'Backup timezone or currency is invalid';
  end if;
  if data #>> '{gym,logo_path}' is not null and (
    data #>> '{gym,logo_path}' !~ ('^' || target_gym_id::text || '/logo/logo-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png)$')
    or not exists (select 1 from storage.objects o where o.bucket_id = 'vyro-gym-logos' and o.name = data #>> '{gym,logo_path}')
  ) then raise exception using errcode = '22023', message = 'Backup logo is invalid or missing'; end if;
  if exists (select 1 from jsonb_array_elements(data->'members') r where r->>'photo_path' is not null and (
      r->>'photo_path' !~ ('^gyms/' || target_gym_id::text || '/members/' || (r->>'id') || '/photo-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png)$')
      or not exists (select 1 from storage.objects o where o.bucket_id = 'vyro-member-photos' and o.name = r->>'photo_path')
    )) then raise exception using errcode = '22023', message = 'Backup member photo is invalid or missing'; end if;

  update public.gyms set name = data #>> '{gym,name}', owner_name = nullif(data #>> '{gym,owner_name}', ''),
    phone = nullif(data #>> '{gym,phone}', ''), email = nullif(data #>> '{gym,email}', ''),
    address = nullif(data #>> '{gym,address}', ''), logo_path = data #>> '{gym,logo_path}',
    branding = coalesce(data #> '{gym,branding}', '{}'::jsonb)
  where id = target_gym_id;
  update public.gym_settings set timezone = data #>> '{settings,timezone}',
    currency = data #>> '{settings,currency}', preferences = coalesce(data #> '{settings,preferences}', '{}'::jsonb)
  where gym_id = target_gym_id;

  for row_json in select value from jsonb_array_elements(data->'plans') loop
    row_json := row_json || jsonb_build_object('gym_id', target_gym_id);
    insert into public.membership_plans select (jsonb_populate_record(null::public.membership_plans, row_json)).*;
    restored_plans := restored_plans + 1;
  end loop;
  for row_json in select value from jsonb_array_elements(data->'members') loop
    row_json := row_json || jsonb_build_object('gym_id', target_gym_id);
    insert into public.members select (jsonb_populate_record(null::public.members, row_json)).*;
    restored_members := restored_members + 1;
  end loop;
  for row_json in select value from jsonb_array_elements(data->'memberships') loop
    row_json := row_json || jsonb_build_object('gym_id', target_gym_id);
    insert into public.member_memberships select (jsonb_populate_record(null::public.member_memberships, row_json)).*;
    restored_memberships := restored_memberships + 1;
  end loop;
  for row_json in select value from jsonb_array_elements(data->'payments') loop
    row_json := row_json || jsonb_build_object('gym_id', target_gym_id, 'status', 'completed');
    insert into public.member_payments select (jsonb_populate_record(null::public.member_payments, row_json)).*;
    row_id := (row_json->>'id')::uuid;
    if (p_backup #>> '{data,payments}') is not null and exists (
      select 1 from jsonb_array_elements(data->'payments') original where original->>'id' = row_id::text and original->>'status' = 'refunded'
    ) then update public.member_payments set status = 'refunded' where id = row_id and gym_id = target_gym_id; end if;
    restored_payments := restored_payments + 1;
  end loop;
  for row_json in select value from jsonb_array_elements(data->'attendance') loop
    row_json := row_json || jsonb_build_object('gym_id', target_gym_id);
    insert into public.attendance_records select (jsonb_populate_record(null::public.attendance_records, row_json)).*;
    restored_attendance := restored_attendance + 1;
  end loop;
  for row_json in select value from jsonb_array_elements(data->'trainers') loop
    row_json := row_json || jsonb_build_object('gym_id', target_gym_id);
    insert into public.trainers select (jsonb_populate_record(null::public.trainers, row_json)).*;
    restored_trainers := restored_trainers + 1;
  end loop;
  for row_json in select value from jsonb_array_elements(data->'expenses') loop
    row_json := row_json || jsonb_build_object('gym_id', target_gym_id);
    insert into public.gym_expenses select (jsonb_populate_record(null::public.gym_expenses, row_json)).*;
    restored_expenses := restored_expenses + 1;
  end loop;
  for row_json in select value from jsonb_array_elements(data->'notification_preferences') loop
    row_json := row_json || jsonb_build_object('gym_id', target_gym_id, 'user_id', caller_id, 'audience', 'gym');
    insert into public.notification_preferences select (jsonb_populate_record(null::public.notification_preferences, row_json)).*
      on conflict on constraint notification_preferences_scope_unique
      do update set enabled = excluded.enabled, updated_at = excluded.updated_at;
    restored_preferences := restored_preferences + 1;
  end loop;

  return jsonb_build_object(
    'members', restored_members, 'plans', restored_plans, 'memberships', restored_memberships,
    'payments', restored_payments, 'attendance', restored_attendance, 'trainers', restored_trainers,
    'expenses', restored_expenses, 'notification_preferences', restored_preferences
  );
end;
$$;

revoke all on function public.restore_gym_operational_backup(jsonb) from public, anon, service_role;
grant execute on function public.restore_gym_operational_backup(jsonb) to authenticated;

commit;
