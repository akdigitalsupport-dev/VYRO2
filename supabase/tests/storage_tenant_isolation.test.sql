begin;
create extension if not exists pgtap;
select plan(27);

-- The migration list is exact: a clean install must not omit the overlay or
-- silently include an unexpected migration.
select ok(
  (select array_agg(version::text order by version::text)
   from supabase_migrations.schema_migrations)
  = array[
    '202610030001', '202610050001',
    '202610060001', '202610060002', '202610060003', '202610060004', '202610060005',
    '202610070006',
    '202610080001', '202610080002', '202610080003', '20261008000350',
    '202610080004', '202610080005', '202610080006', '202610080007', '202610080008', '202610080009',
    '202610090001', '202610090002'
  ]::text[],
  'migration history contains exactly the expected chain and clean-install overlay'
);
select ok(
  (select array_position(array_agg(version::text order by version::text), '20261008000350')
          < array_position(array_agg(version::text order by version::text), '202610080004')
   from supabase_migrations.schema_migrations),
  'storage path helper migration runs before operations suite'
);

select ok(exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'storage_path_gym_id'
    and p.pronargs = 1 and oidvectortypes(p.proargtypes) = 'text'
), 'the prerequisite helper exists with the text signature');
select ok(exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'storage_path_gym_id'
    and p.provolatile = 'i' and not p.prosecdef
    and p.proconfig = array['search_path=""']::text[]
), 'the helper is immutable, invoker-security, and has catalog search_path=""');
select is((select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
  where p.oid = 'public.storage_path_gym_id(text)'::regprocedure), 'postgres'::name,
  'the helper is owned by postgres');
select ok(has_function_privilege('authenticated', 'public.storage_path_gym_id(text)', 'EXECUTE'),
  'authenticated can execute the helper');
select ok(has_function_privilege('service_role', 'public.storage_path_gym_id(text)', 'EXECUTE'),
  'the server service role can execute the helper');
select ok(not has_function_privilege('anon', 'public.storage_path_gym_id(text)', 'EXECUTE'),
  'anonymous users cannot execute the helper');
select ok(not exists (
  select 1 from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.oid = 'public.storage_path_gym_id(text)'::regprocedure
    and a.grantee = 0 and a.privilege_type = 'EXECUTE'
), 'PUBLIC has no helper execute grant');
select is(public.storage_path_gym_id('bbbbbbbb-0000-4000-8000-000000000001/members/photo.jpg'),
  'bbbbbbbb-0000-4000-8000-000000000001'::uuid, 'the helper extracts the first path segment');
select is(public.storage_path_gym_id('invalid-gym/members/photo.jpg'), null::uuid,
  'malformed gym identifiers return null');

select ok(exists (
  select 1 from storage.buckets
  where id = 'vyro-member-photos' and name = 'vyro-member-photos'
    and public = false and file_size_limit = 5242880
    and allowed_mime_types = array['image/jpeg', 'image/png']::text[]
), 'member photo bucket is private and has the expected size and MIME restrictions');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('vyro member photos select', 'vyro member photos insert', 'vyro member photos update', 'vyro member photos delete')),
  4::bigint, 'all four named member-photo storage policies exist exactly once');
select ok(not exists (
  select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'vyro member photos %'
    and (
      roles <> array['authenticated']::name[]
      or (cmd in ('SELECT', 'UPDATE', 'DELETE') and (coalesce(qual, '') not ilike '%vyro-member-photos%'
        or coalesce(qual, '') not ilike '%can_access_member_photo%'))
      or (cmd in ('INSERT', 'UPDATE') and coalesce(with_check, '') not ilike '%can_access_member_photo%')
      or not (
      (policyname = 'vyro member photos select' and cmd = 'SELECT')
      or (policyname = 'vyro member photos insert' and cmd = 'INSERT')
      or (policyname = 'vyro member photos update' and cmd = 'UPDATE')
      or (policyname = 'vyro member photos delete' and cmd = 'DELETE')
      )
    )
), 'member-photo policies remain authenticated, bucket-scoped, and helper-guarded');

-- Isolated users and tenants: rows are inserted under the test transaction and rolled back.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'storage-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'storage-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'storage-owner@example.test', '', now(), '{}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.user_profiles(user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000011', 'gym_admin'),
  ('aaaaaaaa-0000-4000-8000-000000000012', 'gym_admin'),
  ('aaaaaaaa-0000-4000-8000-000000000013', 'platform_owner')
on conflict (user_id) do update set role = excluded.role;
insert into public.gyms(id, name) values
  ('bbbbbbbb-0000-4000-8000-000000000011', 'Storage Tenant A'),
  ('bbbbbbbb-0000-4000-8000-000000000012', 'Storage Tenant B')
on conflict (id) do nothing;
insert into public.gym_user_memberships(gym_id, user_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000011', 'gym_admin'),
  ('bbbbbbbb-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000012', 'gym_admin')
on conflict (gym_id, user_id) do nothing;
insert into public.members(id, gym_id, member_code, full_name, status, archived_at) values
  ('cccccccc-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000011', 'PHOTO-A', 'Storage Member A', 'active', null),
  ('cccccccc-0000-4000-8000-000000000012', 'bbbbbbbb-0000-4000-8000-000000000012', 'PHOTO-B', 'Storage Member B', 'active', null),
  ('cccccccc-0000-4000-8000-000000000013', 'bbbbbbbb-0000-4000-8000-000000000011', 'PHOTO-ARCHIVED', 'Archived Storage Member', 'archived', now())
on conflict (id) do nothing;
insert into storage.objects(bucket_id, name) values
  ('vyro-member-photos', 'gyms/bbbbbbbb-0000-4000-8000-000000000011/members/cccccccc-0000-4000-8000-000000000011/photo-11111111-1111-4111-8111-111111111111.jpg'),
  ('vyro-member-photos', 'gyms/bbbbbbbb-0000-4000-8000-000000000012/members/cccccccc-0000-4000-8000-000000000012/photo-22222222-2222-4222-8222-222222222222.png'),
  ('vyro-member-photos', 'gyms/bbbbbbbb-0000-4000-8000-000000000011/members/cccccccc-0000-4000-8000-000000000013/photo-33333333-3333-4333-8333-333333333333.jpeg');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000011', true);
select is((select count(*) from storage.objects where bucket_id = 'vyro-member-photos' and name like 'gyms/bbbbbbbb-0000-4000-8000-000000000011/%'),
  2::bigint, 'Gym A can read its own active and archived member photos');
select is((select count(*) from storage.objects where bucket_id = 'vyro-member-photos' and name like 'gyms/bbbbbbbb-0000-4000-8000-000000000012/%'),
  0::bigint, 'Gym A cannot read Gym B photos');
select ok(public.can_access_member_photo('gyms/bbbbbbbb-0000-4000-8000-000000000011/members/cccccccc-0000-4000-8000-000000000011/photo-11111111-1111-4111-8111-111111111111.jpg', false),
  'Gym A is authorized for its own member path');
select ok(not public.can_access_member_photo('gyms/bbbbbbbb-0000-4000-8000-000000000012/members/cccccccc-0000-4000-8000-000000000011/photo-44444444-4444-4444-8444-444444444444.jpg', false),
  'changing the gym path cannot authorize another tenant member');
select ok(not public.can_access_member_photo('gyms/bbbbbbbb-0000-4000-8000-000000000011/members/cccccccc-0000-4000-8000-000000000013/photo-33333333-3333-4333-8333-333333333333.jpeg', true),
  'archived members cannot receive new photo uploads');
select throws_ok($$insert into storage.objects(bucket_id, name)
  values ('vyro-member-photos', 'gyms/bbbbbbbb-0000-4000-8000-000000000012/members/cccccccc-0000-4000-8000-000000000012/photo-55555555-5555-4555-8555-555555555555.jpg')$$,
  '42501', null, 'Gym A cannot upload a photo into Gym B storage');
select throws_ok($$insert into storage.objects(bucket_id, name)
  values ('vyro-member-photos', 'gyms/bbbbbbbb-0000-4000-8000-000000000011/members/cccccccc-0000-4000-8000-000000000013/photo-66666666-6666-4666-8666-666666666666.jpg')$$,
  '42501', null, 'Gym A cannot upload a new photo for an archived member');
select lives_ok($$update storage.objects set name = name || '.moved'
  where bucket_id = 'vyro-member-photos' and name like 'gyms/bbbbbbbb-0000-4000-8000-000000000012/%'$$,
  'Gym A cannot update Gym B storage objects');
select throws_ok($$update storage.objects set name = 'gyms/bbbbbbbb-0000-4000-8000-000000000012/members/cccccccc-0000-4000-8000-000000000012/photo-77777777-7777-4777-8777-777777777777.jpg'
  where bucket_id = 'vyro-member-photos' and name like 'gyms/bbbbbbbb-0000-4000-8000-000000000011/members/cccccccc-0000-4000-8000-000000000011/%'$$,
  '42501', null, 'Gym A cannot move its object into Gym B path');
select throws_ok($$delete from storage.objects
  where bucket_id = 'vyro-member-photos' and name like 'gyms/bbbbbbbb-0000-4000-8000-000000000012/%'$$,
  '42501', null, 'Gym A cannot delete Gym B storage objects');
reset role;
select is((select count(*) from storage.objects where bucket_id = 'vyro-member-photos'
  and name = 'gyms/bbbbbbbb-0000-4000-8000-000000000012/members/cccccccc-0000-4000-8000-000000000012/photo-22222222-2222-4222-8222-222222222222.png'),
  1::bigint, 'Gym B photo remains unchanged after Gym A update and delete attempts');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000011', true);
select lives_ok($$insert into storage.objects(bucket_id, name)
  values ('vyro-member-photos', 'gyms/bbbbbbbb-0000-4000-8000-000000000011/members/cccccccc-0000-4000-8000-000000000011/photo-88888888-8888-4888-8888-888888888888.jpg')$$,
  'Gym A can upload to its own active member path');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000013', true);
select is((select count(*) from storage.objects where bucket_id = 'vyro-member-photos'),
  4::bigint, 'Platform Owner retains cross-gym photo access through the existing authorization helper');
reset role;

select * from finish();
rollback;
