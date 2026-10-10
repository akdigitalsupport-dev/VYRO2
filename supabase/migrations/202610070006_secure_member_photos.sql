-- Private, tenant-scoped member photos. Photo bytes live in Storage; only the
-- storage object path is kept on the member row.
alter table public.members
  add column if not exists photo_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'members_photo_path_length_check'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_photo_path_length_check
      check (photo_path is null or char_length(photo_path) <= 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'members_photo_path_tenant_check'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_photo_path_tenant_check
      check (
        photo_path is null
        or photo_path ~ (
          '^gyms/' || gym_id::text || '/members/' || id::text
          || '/photo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png)$'
        )
      );
  end if;
end
$$;

-- Create the bucket on a fresh database. If it already exists, leave it
-- untouched and fail safely unless its configuration is exactly as required.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vyro-member-photos', 'vyro-member-photos', false, 5242880, array['image/jpeg', 'image/png']::text[])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'vyro-member-photos'
      and name = 'vyro-member-photos'
      and public = false
      and file_size_limit = 5242880
      and allowed_mime_types = array['image/jpeg', 'image/png']::text[]
  ) then
    raise exception 'Bucket vyro-member-photos exists with an unexpected configuration';
  end if;
end
$$;

-- Canonical format: gyms/{gym_id}/members/{member_id}/photo-{uuid}.{jpg|jpeg|png}
-- The UUIDs are checked before casts so malformed object names return NULL.
create or replace function public.is_canonical_member_photo_path(object_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select object_name is not null and object_name ~
    '^gyms/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/members/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/photo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png)$';
$$;

create or replace function public.member_photo_path_gym_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not public.is_canonical_member_photo_path(object_name) then
    return null;
  end if;
  return split_part(object_name, '/', 2)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.member_photo_path_member_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not public.is_canonical_member_photo_path(object_name) then
    return null;
  end if;
  return split_part(object_name, '/', 4)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

-- require_active_member is true only for INSERT to retain the live archived-member rule.
create or replace function public.can_access_member_photo(object_name text, require_active_member boolean)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  parsed_gym_id uuid;
  parsed_member_id uuid;
begin
  parsed_gym_id := public.member_photo_path_gym_id(object_name);
  parsed_member_id := public.member_photo_path_member_id(object_name);

  if parsed_gym_id is null or parsed_member_id is null or require_active_member is null then
    return false;
  end if;

  if not public.has_gym_access(parsed_gym_id) then
    return false;
  end if;

  return exists (
    select 1 from public.members m
    where m.id = parsed_member_id
      and m.gym_id = parsed_gym_id
      and (not require_active_member or m.archived_at is null)
  );
end;
$$;

revoke all on function public.is_canonical_member_photo_path(text) from public, anon;
revoke all on function public.member_photo_path_gym_id(text) from public, anon;
revoke all on function public.member_photo_path_member_id(text) from public, anon;
revoke all on function public.can_access_member_photo(text, boolean) from public, anon;
grant execute on function public.is_canonical_member_photo_path(text) to authenticated;
grant execute on function public.member_photo_path_gym_id(text) to authenticated;
grant execute on function public.member_photo_path_member_id(text) to authenticated;
grant execute on function public.can_access_member_photo(text, boolean) to authenticated;

-- Reconcile the known live policies in place; create the same policy if absent
-- on a fresh database. This avoids a second permissive policy set.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vyro member photos select') then
    alter policy "vyro member photos select" on storage.objects to authenticated
      using (bucket_id = 'vyro-member-photos' and public.can_access_member_photo(name, false));
  else
    create policy "vyro member photos select" on storage.objects for select to authenticated
      using (bucket_id = 'vyro-member-photos' and public.can_access_member_photo(name, false));
  end if;

  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vyro member photos insert') then
    alter policy "vyro member photos insert" on storage.objects to authenticated
      with check (bucket_id = 'vyro-member-photos' and public.can_access_member_photo(name, true));
  else
    create policy "vyro member photos insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'vyro-member-photos' and public.can_access_member_photo(name, true));
  end if;

  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vyro member photos update') then
    alter policy "vyro member photos update" on storage.objects to authenticated
      using (bucket_id = 'vyro-member-photos' and public.can_access_member_photo(name, false))
      with check (bucket_id = 'vyro-member-photos' and public.can_access_member_photo(name, false));
  else
    create policy "vyro member photos update" on storage.objects for update to authenticated
      using (bucket_id = 'vyro-member-photos' and public.can_access_member_photo(name, false))
      with check (bucket_id = 'vyro-member-photos' and public.can_access_member_photo(name, false));
  end if;

  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vyro member photos delete') then
    alter policy "vyro member photos delete" on storage.objects to authenticated
      using (bucket_id = 'vyro-member-photos' and public.can_access_member_photo(name, false));
  else
    create policy "vyro member photos delete" on storage.objects for delete to authenticated
      using (bucket_id = 'vyro-member-photos' and public.can_access_member_photo(name, false));
  end if;
end
$$;
