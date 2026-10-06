-- VYRO member profile photos
-- Private Storage bucket with tenant-scoped access.

alter table public.members
  add column if not exists photo_path text;

-- Private bucket.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'vyro-member-photos',
  'vyro-member-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Safely extract the gym UUID from the first storage folder.
create or replace function public.storage_path_gym_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

-- Safely extract the member UUID from the second storage folder.
create or replace function public.storage_path_member_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (storage.foldername(object_name))[2]::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.storage_path_gym_id(text) from public, anon;
revoke all on function public.storage_path_member_id(text) from public, anon;

grant execute on function public.storage_path_gym_id(text) to authenticated;
grant execute on function public.storage_path_member_id(text) to authenticated;

-- Remove old versions if this migration is ever re-applied during development.
drop policy if exists "vyro member photos select" on storage.objects;
drop policy if exists "vyro member photos insert" on storage.objects;
drop policy if exists "vyro member photos update" on storage.objects;
drop policy if exists "vyro member photos delete" on storage.objects;

-- Read/download:
-- Platform owners may access authorized gyms.
-- Gym admins may access only their own gym.
create policy "vyro member photos select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vyro-member-photos'
  and public.has_gym_access(public.storage_path_gym_id(name))
  and exists (
    select 1
    from public.members m
    where m.id = public.storage_path_member_id(name)
      and m.gym_id = public.storage_path_gym_id(name)
  )
);

-- Upload:
-- The target member must belong to the same authorized gym.
create policy "vyro member photos insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vyro-member-photos'
  and public.has_gym_access(public.storage_path_gym_id(name))
  and exists (
    select 1
    from public.members m
    where m.id = public.storage_path_member_id(name)
      and m.gym_id = public.storage_path_gym_id(name)
      and m.archived_at is null
  )
);

-- Replacement/update:
-- Only within an authorized gym/member path.
create policy "vyro member photos update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'vyro-member-photos'
  and public.has_gym_access(public.storage_path_gym_id(name))
  and exists (
    select 1
    from public.members m
    where m.id = public.storage_path_member_id(name)
      and m.gym_id = public.storage_path_gym_id(name)
  )
)
with check (
  bucket_id = 'vyro-member-photos'
  and public.has_gym_access(public.storage_path_gym_id(name))
  and exists (
    select 1
    from public.members m
    where m.id = public.storage_path_member_id(name)
      and m.gym_id = public.storage_path_gym_id(name)
  )
);

-- Delete:
create policy "vyro member photos delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vyro-member-photos'
  and public.has_gym_access(public.storage_path_gym_id(name))
  and exists (
    select 1
    from public.members m
    where m.id = public.storage_path_member_id(name)
      and m.gym_id = public.storage_path_gym_id(name)
  )
);

-- Keep the stored path reasonably constrained.
alter table public.members
  drop constraint if exists members_photo_path_length_check;

alter table public.members
  add constraint members_photo_path_length_check
  check (photo_path is null or char_length(photo_path) <= 500);