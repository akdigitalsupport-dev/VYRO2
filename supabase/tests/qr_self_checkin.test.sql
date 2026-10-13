begin;
create extension if not exists pgtap;
select plan(25);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000041', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qr-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000042', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-admin@example.test', '', now(), '{}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.user_profiles(user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000041', 'gym_admin'),
  ('aaaaaaaa-0000-4000-8000-000000000042', 'gym_admin')
on conflict (user_id) do update set role = excluded.role;
insert into public.gyms(id, name) values
  ('bbbbbbbb-0000-4000-8000-000000000041', 'QR Check-in Test Gym'),
  ('bbbbbbbb-0000-4000-8000-000000000042', 'Other QR Test Gym')
on conflict (id) do nothing;
insert into public.gym_user_memberships(gym_id, user_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000041', 'aaaaaaaa-0000-4000-8000-000000000041', 'gym_admin'),
  ('bbbbbbbb-0000-4000-8000-000000000042', 'aaaaaaaa-0000-4000-8000-000000000042', 'gym_admin')
on conflict (gym_id, user_id) do nothing;
insert into public.membership_plans(id, gym_id, name, duration_days, price) values
  ('dddddddd-0000-4000-8000-000000000041', 'bbbbbbbb-0000-4000-8000-000000000041', 'QR Test Plan', 30, 100),
  ('dddddddd-0000-4000-8000-000000000042', 'bbbbbbbb-0000-4000-8000-000000000042', 'Other QR Plan', 30, 100)
on conflict (id) do nothing;

-- Simulate active historical members without check-in IDs. The migration does
-- not alter existing rows; the explicit admin action assigns their IDs.
insert into public.members(id, gym_id, member_code, full_name, joining_date, status, archived_at) values
  ('cccccccc-0000-4000-8000-000000000041', 'bbbbbbbb-0000-4000-8000-000000000041', 'QR-HIST-41', 'QR Test Member One', current_date - 1, 'active', null),
  ('cccccccc-0000-4000-8000-000000000042', 'bbbbbbbb-0000-4000-8000-000000000041', 'QR-HIST-42', 'QR Test Member Two', current_date - 1, 'active', null),
  ('cccccccc-0000-4000-8000-000000000043', 'bbbbbbbb-0000-4000-8000-000000000041', 'QR-HIST-43', 'QR Test Member Three', current_date - 1, 'active', null),
  ('cccccccc-0000-4000-8000-000000000044', 'bbbbbbbb-0000-4000-8000-000000000041', 'QR-HIST-44', 'QR Inactive Member', current_date - 1, 'inactive', null)
on conflict (id) do nothing;
delete from private.member_checkin_codes
where member_id in (
  'cccccccc-0000-4000-8000-000000000041', 'cccccccc-0000-4000-8000-000000000042',
  'cccccccc-0000-4000-8000-000000000043', 'cccccccc-0000-4000-8000-000000000044'
);
insert into public.member_memberships(id, gym_id, member_id, membership_plan_id, plan_name_snapshot,
  duration_days_snapshot, price_snapshot, start_date, end_date, status) values
  ('eeeeeeee-0000-4000-8000-000000000041', 'bbbbbbbb-0000-4000-8000-000000000041', 'cccccccc-0000-4000-8000-000000000041', 'dddddddd-0000-4000-8000-000000000041', 'QR Test Plan', 30, 100, (now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date + 30, 'active'),
  ('eeeeeeee-0000-4000-8000-000000000042', 'bbbbbbbb-0000-4000-8000-000000000041', 'cccccccc-0000-4000-8000-000000000042', 'dddddddd-0000-4000-8000-000000000041', 'QR Test Plan', 30, 100, (now() at time zone 'Asia/Kolkata')::date - 30, (now() at time zone 'Asia/Kolkata')::date - 1, 'active'),
  ('eeeeeeee-0000-4000-8000-000000000043', 'bbbbbbbb-0000-4000-8000-000000000041', 'cccccccc-0000-4000-8000-000000000043', 'dddddddd-0000-4000-8000-000000000041', 'QR Test Plan', 30, 100, (now() at time zone 'Asia/Kolkata')::date + 1, (now() at time zone 'Asia/Kolkata')::date + 31, 'active'),
  ('eeeeeeee-0000-4000-8000-000000000044', 'bbbbbbbb-0000-4000-8000-000000000041', 'cccccccc-0000-4000-8000-000000000044', 'dddddddd-0000-4000-8000-000000000041', 'QR Test Plan', 30, 100, (now() at time zone 'Asia/Kolkata')::date - 1, (now() at time zone 'Asia/Kolkata')::date + 29, 'active')
on conflict (id) do nothing;

select is((select count(*) from private.member_checkin_codes c where c.gym_id = 'bbbbbbbb-0000-4000-8000-000000000041'), 0::bigint,
  'existing member rows remain unchanged until an admin generates IDs');

-- Occupy every code temporarily to exercise the capacity guard. The foreign
-- key is restored before the rest of the checks, and the transaction rolls back.
set constraints members_require_membership immediate;
alter table private.member_checkin_codes drop constraint member_checkin_codes_member_gym_fk;
insert into private.member_checkin_codes(member_id, gym_id, check_in_code)
select gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000041', lpad(n::text, 4, '0')
from generate_series(0, 9999) n;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000041', true);
select throws_ok($$select * from public.generate_gym_checkin_codes()$$, '23514', null,
  'capacity overflow aborts code generation instead of assigning a partial set');
reset role;
select is((select count(*) from private.member_checkin_codes c
  where c.gym_id = 'bbbbbbbb-0000-4000-8000-000000000041'
    and c.member_id in ('cccccccc-0000-4000-8000-000000000041','cccccccc-0000-4000-8000-000000000042','cccccccc-0000-4000-8000-000000000043')),
  0::bigint, 'capacity failure leaves every active historical member unchanged');
delete from private.member_checkin_codes where gym_id = 'bbbbbbbb-0000-4000-8000-000000000041';
alter table private.member_checkin_codes add constraint member_checkin_codes_member_gym_fk
  foreign key (member_id, gym_id) references public.members(id, gym_id) on delete cascade;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000041', true);
select is((select assigned_count from public.generate_gym_checkin_codes()), 3,
  'admin generation assigns codes to active members in one action');
select is((select active_members from public.get_gym_checkin_code_summary()), 3,
  'admin summary returns only the authenticated gym member count');
select is((select assigned_codes from public.get_gym_checkin_code_summary()), 3,
  'all active members receive an assigned ID');
select is((select count(*) from public.get_gym_checkin_codes(500, 0)), 3::bigint,
  'the admin roster returns active codes only');
select is((select count(*) from public.get_gym_checkin_codes(500, 0) where check_in_code !~ '^[0-9]{4}$'), 0::bigint,
  'member IDs are four-digit text including leading zeroes');
select is((select count(distinct check_in_code) from public.get_gym_checkin_codes(500, 0)), 3::bigint,
  'generated member IDs do not collide within the gym');
select is((select count(*) from public.get_gym_checkin_codes(500, 0) where full_name like 'Other%'), 0::bigint,
  'the admin roster does not expose another gym member');
reset role;
select throws_ok(
  format('insert into private.member_checkin_codes(member_id,gym_id,check_in_code) values (''cccccccc-0000-4000-8000-000000000044'', ''bbbbbbbb-0000-4000-8000-000000000041'', %L)',
    (select check_in_code from private.member_checkin_codes where gym_id = 'bbbbbbbb-0000-4000-8000-000000000041' limit 1)),
  '23505', null, 'the database rejects a duplicate code even if the admin UI is bypassed');
reset role;

select ok(not has_function_privilege('anon', 'public.check_in_member_public(uuid,text,text)', 'execute'),
  'anonymous clients cannot invoke the privileged check-in RPC directly');
select ok(has_function_privilege('service_role', 'public.check_in_member_public(uuid,text,text)', 'execute'),
  'only the server service role can invoke the check-in RPC');
select ok(has_function_privilege('anon', 'public.get_public_gym_checkin_branding(uuid)', 'execute'),
  'the QR landing page can request the narrow public gym name');
select is((select gym_name from public.get_public_gym_checkin_branding('bbbbbbbb-0000-4000-8000-000000000041')), 'QR Check-in Test Gym',
  'public branding returns the gym name and no member details');

set local role service_role;
reset role;
select set_config('test.qr_active_code', (select check_in_code from private.member_checkin_codes where member_id = 'cccccccc-0000-4000-8000-000000000041'), true);
select set_config('test.qr_expired_code', (select check_in_code from private.member_checkin_codes where member_id = 'cccccccc-0000-4000-8000-000000000042'), true);
select set_config('test.qr_future_code', (select check_in_code from private.member_checkin_codes where member_id = 'cccccccc-0000-4000-8000-000000000043'), true);
set local role service_role;
select is(public.check_in_member_public('bbbbbbbb-0000-4000-8000-000000000041', current_setting('test.qr_active_code'), repeat('a', 64)),
  'checked_in', 'a valid active member is checked in');
select is(public.check_in_member_public(
  'bbbbbbbb-0000-4000-8000-000000000041',
  current_setting('test.qr_active_code'),
  repeat('a', 64)), 'unavailable', 'a same-day duplicate receives the same generic failure as an invalid ID');
select is(public.check_in_member_public(
  'bbbbbbbb-0000-4000-8000-000000000041', '9999', repeat('a', 64)), 'unavailable',
  'a bad ID produces the generic unavailable result');
select is(public.check_in_member_public(
  'bbbbbbbb-0000-4000-8000-000000000041',
  current_setting('test.qr_expired_code'),
  repeat('a', 64)), 'unavailable', 'a membership that ended before gym-local today is rejected');
select is(public.check_in_member_public(
  'bbbbbbbb-0000-4000-8000-000000000041',
  current_setting('test.qr_future_code'),
  repeat('a', 64)), 'unavailable', 'a membership starting after gym-local today is rejected');
select is((select count(*) from public.attendance_records where gym_id = 'bbbbbbbb-0000-4000-8000-000000000041'), 1::bigint,
  'the unique gym-local day constraint allows only one successful check-in');
select is((select source from public.attendance_records where gym_id = 'bbbbbbbb-0000-4000-8000-000000000041' limit 1), 'qr',
  'QR attendance is stored separately from staff manual attendance');
select is((select attendance_date from public.attendance_records where gym_id = 'bbbbbbbb-0000-4000-8000-000000000041' limit 1),
  (now() at time zone 'Asia/Kolkata')::date, 'attendance date uses the gym-local calendar day');
select public.check_in_member_public('bbbbbbbb-0000-4000-8000-000000000041', '9998', repeat('a', 64));
select public.check_in_member_public('bbbbbbbb-0000-4000-8000-000000000041', '9997', repeat('a', 64));
select public.check_in_member_public('bbbbbbbb-0000-4000-8000-000000000041', '9996', repeat('a', 64));
select public.check_in_member_public('bbbbbbbb-0000-4000-8000-000000000041', '9995', repeat('a', 64));
select public.check_in_member_public('bbbbbbbb-0000-4000-8000-000000000041', '9994', repeat('a', 64));
select public.check_in_member_public('bbbbbbbb-0000-4000-8000-000000000041', '9993', repeat('a', 64));
select public.check_in_member_public('bbbbbbbb-0000-4000-8000-000000000041', '9992', repeat('a', 64));
reset role;
select is((select attempt_count from private.qr_checkin_rate_limits where gym_id = 'bbbbbbbb-0000-4000-8000-000000000041' and client_key_hash = repeat('a', 64)), 12,
  'repeated submitted IDs from one client are rate-limited within the current window');

set constraints members_require_membership deferred;
insert into public.members(id, gym_id, member_code, full_name, joining_date, status, archived_at)
values ('cccccccc-0000-4000-8000-000000000045', 'bbbbbbbb-0000-4000-8000-000000000041', 'QR-NEW-45', 'New QR Member', current_date, 'active', null);
insert into public.member_memberships(id, gym_id, member_id, membership_plan_id, plan_name_snapshot,
  duration_days_snapshot, price_snapshot, start_date, end_date, status)
values ('eeeeeeee-0000-4000-8000-000000000045', 'bbbbbbbb-0000-4000-8000-000000000041',
  'cccccccc-0000-4000-8000-000000000045', 'dddddddd-0000-4000-8000-000000000041',
  'QR Test Plan', 30, 100, current_date, current_date + 30, 'active');
select ok((select check_in_code ~ '^[0-9]{4}$' from private.member_checkin_codes
  where member_id = 'cccccccc-0000-4000-8000-000000000045'),
  'new active members receive a unique code automatically');

select * from finish();
rollback;
