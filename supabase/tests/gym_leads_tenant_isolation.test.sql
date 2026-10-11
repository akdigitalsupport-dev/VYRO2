begin;
create extension if not exists pgtap;
select plan(27);

-- These fixtures must run only in an isolated database with the full migration
-- chain, including 202610110007_gym_leads.sql, already installed.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lead-gym-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lead-gym-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lead-platform-owner@example.test', '', now(), '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.user_profiles(user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000101', 'gym_admin'),
  ('aaaaaaaa-0000-4000-8000-000000000102', 'gym_admin'),
  ('aaaaaaaa-0000-4000-8000-000000000103', 'platform_owner')
on conflict (user_id) do update set role = excluded.role;

insert into public.gyms(id, name) values
  ('bbbbbbbb-0000-4000-8000-000000000101', 'Leads Tenant Gym A'),
  ('bbbbbbbb-0000-4000-8000-000000000102', 'Leads Tenant Gym B')
on conflict (id) do nothing;

insert into public.gym_user_memberships(gym_id, user_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000101', 'aaaaaaaa-0000-4000-8000-000000000101', 'gym_admin'),
  ('bbbbbbbb-0000-4000-8000-000000000102', 'aaaaaaaa-0000-4000-8000-000000000102', 'gym_admin')
on conflict (gym_id, user_id) do update set role = excluded.role;

insert into public.gym_leads(id, gym_id, name, status, created_by, updated_at) values
  ('cccccccc-0000-4000-8000-000000000101', 'bbbbbbbb-0000-4000-8000-000000000101', 'Gym A Lead', 'new', 'aaaaaaaa-0000-4000-8000-000000000102', '2000-01-01 00:00:00+00'),
  ('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000102', 'Gym B Lead', 'new', 'aaaaaaaa-0000-4000-8000-000000000102', '2000-01-01 00:00:00+00')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000101', true);
select is((select count(*) from public.gym_leads where id = 'cccccccc-0000-4000-8000-000000000101'), 1::bigint,
  'Gym Admin A can read its own lead');
select lives_ok($$insert into public.gym_leads(id, gym_id, name, created_by) values
  ('cccccccc-0000-4000-8000-000000000103', 'bbbbbbbb-0000-4000-8000-000000000101', 'Gym A New Lead', 'aaaaaaaa-0000-4000-8000-000000000101')$$,
  'Gym Admin A can insert a lead for Gym A');
select is((select created_by from public.gym_leads where id = 'cccccccc-0000-4000-8000-000000000103'),
  'aaaaaaaa-0000-4000-8000-000000000101'::uuid, 'Gym Admin A insert is attributed to A');
select throws_ok($$insert into public.gym_leads(gym_id, name, created_by) values
  ('bbbbbbbb-0000-4000-8000-000000000101', 'Misattributed Lead', 'aaaaaaaa-0000-4000-8000-000000000102')$$,
  '42501', null, 'Gym Admin A cannot attribute a new lead to Gym Admin B');
select throws_ok($$insert into public.gym_leads(gym_id, name) values
  ('bbbbbbbb-0000-4000-8000-000000000101', 'Missing Attribution Lead')$$,
  '42501', null, 'Gym Admin A cannot insert a lead without created_by');
select lives_ok($$update public.gym_leads set status = 'contacted'
  where id = 'cccccccc-0000-4000-8000-000000000101'$$,
  'Gym Admin A can update a Gym A lead created by Gym Admin B');
select is((select updated_at from public.gym_leads where id = 'cccccccc-0000-4000-8000-000000000101'),
  transaction_timestamp(), 'updated_at trigger still runs with column-level UPDATE privileges');
select throws_ok($$update public.gym_leads set created_by = 'aaaaaaaa-0000-4000-8000-000000000101'
  where id = 'cccccccc-0000-4000-8000-000000000101'$$, '42501', null,
  'Gym Admin A cannot change created_by on a lead created by Gym Admin B');
select is((select count(*) from public.gym_leads where id = 'cccccccc-0000-4000-8000-000000000102'), 0::bigint,
  'Gym Admin A cannot read Gym B leads');
select throws_ok($$insert into public.gym_leads(gym_id, name) values
  ('bbbbbbbb-0000-4000-8000-000000000102', 'Cross Tenant Lead')$$, '42501', null,
  'Gym Admin A cannot insert a lead for Gym B');
select lives_ok($$update public.gym_leads set name = 'Changed by Gym A'
  where id = 'cccccccc-0000-4000-8000-000000000102'$$,
  'Gym Admin A cannot target Gym B through UPDATE');
reset role;
select is((select created_by from public.gym_leads where id = 'cccccccc-0000-4000-8000-000000000101'),
  'aaaaaaaa-0000-4000-8000-000000000102'::uuid,
  'created_by remains Gym Admin B after Gym Admin A updates an allowed field');
select is((select name from public.gym_leads where id = 'cccccccc-0000-4000-8000-000000000102'), 'Gym B Lead',
  'Gym B lead is unchanged after Gym A update');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000101', true);
select throws_ok($$update public.gym_leads set gym_id = 'bbbbbbbb-0000-4000-8000-000000000102'
  where id = 'cccccccc-0000-4000-8000-000000000101'$$, '42501', null,
  'Gym Admin A cannot move its lead into Gym B');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000102', true);
select is((select count(*) from public.gym_leads where id = 'cccccccc-0000-4000-8000-000000000102'), 1::bigint,
  'Gym Admin B can read its own lead');
select is((select count(*) from public.gym_leads where id = 'cccccccc-0000-4000-8000-000000000101'), 0::bigint,
  'Gym Admin B cannot read Gym A leads');
select lives_ok($$update public.gym_leads set status = 'lost'
  where id = 'cccccccc-0000-4000-8000-000000000101'$$,
  'Gym Admin B cannot target Gym A through UPDATE');
reset role;
select is((select status from public.gym_leads where id = 'cccccccc-0000-4000-8000-000000000101'), 'contacted',
  'Gym A lead is unchanged after Gym B update');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000103', true);
select is(public.has_gym_access('bbbbbbbb-0000-4000-8000-000000000101'), true,
  'shared helper retains its existing Platform Owner behavior');
select is((select count(*) from public.gym_leads where gym_id in (
  'bbbbbbbb-0000-4000-8000-000000000101', 'bbbbbbbb-0000-4000-8000-000000000102')), 0::bigint,
  'Platform Owner cannot read leads without a Gym Admin identity and membership');
select throws_ok($$insert into public.gym_leads(gym_id, name) values
  ('bbbbbbbb-0000-4000-8000-000000000101', 'Platform Owner Lead')$$, '42501', null,
  'Platform Owner cannot insert leads through the shared helper bypass');
select lives_ok($$update public.gym_leads set status = 'lost'
  where id = 'cccccccc-0000-4000-8000-000000000101'$$,
  'Platform Owner cannot target a Gym A lead through UPDATE');
reset role;
select is((select status from public.gym_leads where id = 'cccccccc-0000-4000-8000-000000000101'), 'contacted',
  'Gym A lead is unchanged after Platform Owner update');

set local role anon;
select throws_ok($$select * from public.gym_leads limit 1$$, '42501', null,
  'Unauthenticated role cannot read leads');
select throws_ok($$insert into public.gym_leads(gym_id, name) values
  ('bbbbbbbb-0000-4000-8000-000000000101', 'Anonymous Lead')$$, '42501', null,
  'Unauthenticated role cannot insert leads');
select throws_ok($$update public.gym_leads set status = 'lost'$$, '42501', null,
  'Unauthenticated role cannot update leads');

reset role;
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000102';
select is((select created_by from public.gym_leads where id = 'cccccccc-0000-4000-8000-000000000101'), null::uuid,
  'deleting the creator preserves ON DELETE SET NULL behavior');

select * from finish();
rollback;
