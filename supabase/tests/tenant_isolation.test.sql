begin;
select plan(12);

-- These fixed IDs are isolated to the transactional Supabase test database.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gym-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gym-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test', '', now(), '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.user_profiles(user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'gym_admin'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'gym_admin'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'platform_owner')
on conflict (user_id) do update set role = excluded.role;

insert into public.gyms(id, name) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Tenant Isolation Gym A'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Tenant Isolation Gym B')
on conflict (id) do nothing;
insert into public.gym_user_memberships(gym_id, user_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'gym_admin'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', 'gym_admin')
on conflict (gym_id, user_id) do nothing;
insert into public.members(id, gym_id, member_code, full_name) values
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'A-1', 'Gym A Member'),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'B-1', 'Gym B Member')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);

select is((select count(*) from public.members where id = 'cccccccc-0000-4000-8000-000000000002'), 0::bigint,
  'Gym A cannot read Gym B member rows');
select is((select count(*) from public.members where id = 'cccccccc-0000-4000-8000-000000000001'), 1::bigint,
  'Gym A can read its own member rows');
select lives_ok($$update public.members set full_name = 'Changed by Gym A' where id = 'cccccccc-0000-4000-8000-000000000002'$$,
  'A cross-tenant update affects no accessible row');
select is((select full_name from public.members where id = 'cccccccc-0000-4000-8000-000000000002'), 'Gym B Member',
  'Gym A cannot modify Gym B member data');
select throws_ok($$delete from public.members where id = 'cccccccc-0000-4000-8000-000000000002'$$, '42501', null,
  'Gym A cannot delete Gym B member data');
select throws_ok($$select public.get_gym_dashboard_summary('bbbbbbbb-0000-4000-8000-000000000002')$$, '42501', null,
  'Gym A cannot call a dashboard summary for Gym B');
select throws_ok($$select public.get_platform_dashboard_summary()$$, '42501', null,
  'A gym admin cannot access platform summary data');
select throws_ok($$insert into public.member_payments(gym_id, member_id, amount, payment_method)
  values ('bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 100, 'cash')$$, '42501', null,
  'Client-supplied Gym B ID cannot override Gym A identity');
select throws_ok($$update public.user_profiles set role = 'platform_owner' where user_id = auth.uid()$$, '42501', null,
  'A gym admin cannot promote its own role');

reset role;
set local role anon;
select throws_ok($$select * from public.members limit 1$$, '42501', null,
  'Unauthenticated database access is denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', true);
select lives_ok($$select public.get_platform_dashboard_summary()$$,
  'A platform owner can access platform summary data');
select is((select count(*) from public.members where id = 'cccccccc-0000-4000-8000-000000000002'), 1::bigint,
  'Platform owner can access an authorized gym member row');

select * from finish();
rollback;
