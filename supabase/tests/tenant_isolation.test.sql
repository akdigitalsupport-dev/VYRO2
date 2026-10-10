begin;
create extension if not exists pgtap;
select plan(119);

-- These fixtures are isolated to the transactional Supabase test database.
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

insert into public.membership_plans(id, gym_id, name, duration_days, price) values
  ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'Gym A Plan', 30, 100),
  ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'Gym B Plan', 30, 200)
on conflict (id) do nothing;
insert into public.members(id, gym_id, member_code, full_name) values
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'A-1', 'Gym A Member'),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'B-1', 'Gym B Member')
on conflict (id) do nothing;
insert into public.member_memberships(id, gym_id, member_id, membership_plan_id, plan_name_snapshot,
  duration_days_snapshot, price_snapshot, start_date, end_date, status) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'Gym A Plan', 30, 100, '2026-01-01', '2026-01-31', 'expired'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000002', 'Gym B Plan', 30, 200, '2026-01-01', '2026-01-31', 'expired')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);

select is((select count(*) from public.members where id = 'cccccccc-0000-4000-8000-000000000002'), 0::bigint,
  'Gym A cannot read Gym B member rows');
select is((select count(*) from public.members where id = 'cccccccc-0000-4000-8000-000000000001'), 1::bigint,
  'Gym A can read its own member rows');
select lives_ok($$update public.members set full_name = 'Changed by Gym A' where id = 'cccccccc-0000-4000-8000-000000000002'$$,
  'A cross-tenant member update affects no accessible row');
reset role;
select is((select full_name from public.members where id = 'cccccccc-0000-4000-8000-000000000002'), 'Gym B Member',
  'Gym A cannot modify Gym B member data');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
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

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
select is((select count(*) from public.membership_plans where id = 'dddddddd-0000-4000-8000-000000000001'), 1::bigint,
  'Gym A can read its own plan');
select is((select count(*) from public.membership_plans where id = 'dddddddd-0000-4000-8000-000000000002'), 0::bigint,
  'Gym A cannot read Gym B plans');
select lives_ok($$insert into public.membership_plans(id, gym_id, name, duration_days, price)
  values ('dddddddd-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000001', 'Gym A Custom Plan', 42, 425.50)$$,
  'Gym A can create a custom plan for its own gym');
select throws_ok($$insert into public.membership_plans(id, gym_id, name, duration_days, price)
  values ('dddddddd-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'Cross Tenant Plan', 30, 100)$$, '42501', null,
  'Gym A cannot create a plan for Gym B');
select lives_ok($$update public.membership_plans set price = 999 where id = 'dddddddd-0000-4000-8000-000000000002'$$,
  'Gym A cannot affect Gym B plans through an update');
reset role;
select is((select price from public.membership_plans where id = 'dddddddd-0000-4000-8000-000000000002'), 200::numeric,
  'Gym B plan remains unchanged after Gym A update');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
select is((select count(*) from public.member_memberships where id = 'eeeeeeee-0000-4000-8000-000000000001'), 1::bigint,
  'Gym A can read its own membership history');
select is((select count(*) from public.member_memberships where id = 'eeeeeeee-0000-4000-8000-000000000002'), 0::bigint,
  'Gym A cannot read Gym B membership history');
select lives_ok($$select * from public.create_gym_member_with_registration(
  'P3-AUTO-001', 'Phase Three Member', '+91 98765 43210', 'phase3@example.test', null, null,
  null, '2026-07-01', null, 'dddddddd-0000-4000-8000-000000000001', '2026-07-01',
  0, null, null, null, null, null, null, null, null, false)$$,
  'Gym A can create a member and first membership atomically');
select is((select count(*) from public.member_memberships mm join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
  where m.member_code = 'P3-AUTO-001' and mm.status = 'active'), 1::bigint,
  'A newly created member has a separate membership record');
select is((select count(*) from public.member_registration_payments rp join public.members m on m.id = rp.member_id and m.gym_id = rp.gym_id
  where m.member_code = 'P3-AUTO-001'), 0::bigint,
  'Unchecked registration fee creates no registration transaction');
select lives_ok($$select * from public.create_gym_member_with_registration(
  'P3-REG-001', 'Registration Member', '+91 98765 43211', 'registration@example.test', null, null,
  null, current_date, null, 'dddddddd-0000-4000-8000-000000000001', current_date,
  0, null, null, null, null, current_date, 'upi', 'P3-REG-RECEIPT', null, true)$$,
  'Gym A can create a member with an opted-in registration fee');
select is((select amount from public.member_registration_payments where reference = 'P3-REG-RECEIPT'),
  (select registration_fee_amount from public.gym_settings where gym_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  'Registration amount is snapshotted from server-side gym settings');
select is((select status from public.member_registration_payments where reference = 'P3-REG-RECEIPT'),
  'completed', 'Opted-in registration is recorded as completed');
select is((select count(*) from public.member_payments p join public.members m on m.id = p.member_id and m.gym_id = p.gym_id
  where m.member_code = 'P3-REG-001'), 0::bigint,
  'Registration transaction is separate from membership payments');
select lives_ok($$select * from public.assign_membership_with_payment(
  (select id from public.members where member_code = 'P3-AUTO-001'),
  'dddddddd-0000-4000-8000-000000000001', '2026-08-01', 0, null, null, null, null)$$,
  'Gym A can renew its member without replacing history');
select is((select count(*) from public.member_memberships mm join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
  where m.member_code = 'P3-AUTO-001'), 2::bigint,
  'Renewal preserves the previous membership row');
select is((select count(*) from public.member_memberships mm join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
  where m.member_code = 'P3-AUTO-001' and mm.start_date = '2026-07-01' and mm.status = 'expired'), 1::bigint,
  'Renewal marks the completed prior term expired');
select is((select count(*) from public.member_memberships mm join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
  where m.member_code = 'P3-AUTO-001' and mm.start_date = '2026-08-01' and mm.status = 'active'), 1::bigint,
  'Renewal creates a distinct active membership row');
select is((select count(*) from public.member_registration_payments rp join public.members m on m.id = rp.member_id and m.gym_id = rp.gym_id
  where m.member_code = 'P3-AUTO-001'), 0::bigint,
  'Membership renewal does not add a registration transaction');
select is((select total_count from public.get_gym_member_directory(null, null, null, 25, 0)), 3::bigint,
  'Gym A directory is paginated from its own member records');
select ok((select rows::text not like '%Gym B Member%' and rows::text like '%Gym A Member%'
  from public.get_gym_member_directory(null, null, null, 25, 0)),
  'The member directory RPC does not expose another gym');
select throws_ok($$select public.assign_member_membership(
  (select id from public.members where member_code = 'P3-AUTO-001'),
  'dddddddd-0000-4000-8000-000000000002', '2026-09-01')$$, '42501', null,
  'Gym A cannot assign a Gym B plan to its member');
select throws_ok($$insert into public.members(id, gym_id, member_code, full_name)
  values ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 'A-CROSS', 'Cross Tenant Member')$$, '42501', null,
  'Gym A cannot create a member in Gym B');
select throws_ok($$insert into public.member_memberships(gym_id, member_id, membership_plan_id, plan_name_snapshot, duration_days_snapshot, price_snapshot, start_date, end_date)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', 'Gym A Plan', 30, 100, '2026-09-01', '2026-10-01')$$, '23503', null,
  'A Gym B member cannot be linked to a Gym A membership');
select throws_ok($$insert into public.member_memberships(gym_id, member_id, membership_plan_id, plan_name_snapshot, duration_days_snapshot, price_snapshot, start_date, end_date)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002', 'Gym B Plan', 30, 200, '2026-09-01', '2026-10-01')$$, '23503', null,
  'A Gym A member cannot be linked to a Gym B plan');
select lives_ok($$update public.member_memberships set status = 'cancelled' where id = 'eeeeeeee-0000-4000-8000-000000000002'$$,
  'Gym A cannot change Gym B membership history through an update');
reset role;
select is((select status from public.member_memberships where id = 'eeeeeeee-0000-4000-8000-000000000002'), 'expired',
  'Gym B membership remains unchanged after Gym A update');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', true);
select is((select count(*) from public.membership_plans where id = 'dddddddd-0000-4000-8000-000000000002'), 1::bigint,
  'Platform Owner can read authorized Gym B plans');
select is((select count(*) from public.member_memberships where id = 'eeeeeeee-0000-4000-8000-000000000002'), 1::bigint,
  'Platform Owner can read authorized gym membership history');

select ok(exists(select 1 from public.audit_logs where actor_user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
  and gym_id = 'bbbbbbbb-0000-4000-8000-000000000001' and entity_id = 'dddddddd-0000-4000-8000-000000000003'
  and action = 'membership_plan.created'), 'Plan creation is written to the existing audit log');
select ok(exists(select 1 from public.audit_logs where actor_user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
  and gym_id = 'bbbbbbbb-0000-4000-8000-000000000001'
  and entity_id = (select id from public.members where member_code = 'P3-AUTO-001')
  and action = 'member.created'), 'Member creation is written to the existing audit log');
select ok(exists(select 1 from public.audit_logs where actor_user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
  and gym_id = 'bbbbbbbb-0000-4000-8000-000000000001'
  and entity_id = (select mm.id from public.member_memberships mm join public.members m on m.id = mm.member_id and m.gym_id = mm.gym_id
    where m.member_code = 'P3-AUTO-001' and mm.start_date = '2026-08-01')
  and action = 'membership.created'), 'Membership creation is written to the existing audit log');

select throws_ok($$insert into public.members(gym_id, member_code, full_name)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'A-1', 'Duplicate Member')$$, '23505', null,
  'Member codes remain unique within one gym');
select throws_ok($$insert into public.member_memberships(gym_id, member_id, membership_plan_id, plan_name_snapshot, duration_days_snapshot, price_snapshot, start_date, end_date)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'Gym A Plan', 30, 100, '2026-10-02', '2026-10-01')$$, '23514', null,
  'Membership expiry cannot precede its start date');

reset role;
-- Add attendance-only fixtures after the original Phase 3 assertions so those checks stay unchanged.
insert into public.members(id, gym_id, member_code, full_name, status, joining_date, archived_at) values
  ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000001', 'A-ATT-VALID', 'Gym A Attendance Member', 'active', current_date, null),
  ('cccccccc-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'B-ATT-VALID', 'Gym B Attendance Member', 'active', current_date, null),
  ('cccccccc-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000001', 'A-ATT-EXPIRED', 'Gym A Expired Member', 'active', current_date - 40, null),
  ('cccccccc-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000001', 'A-ATT-ARCHIVED', 'Gym A Archived Member', 'archived', current_date, now())
on conflict (id) do nothing;
insert into public.member_memberships(id, gym_id, member_id, membership_plan_id, plan_name_snapshot,
  duration_days_snapshot, price_snapshot, start_date, end_date, status) values
  ('eeeeeeee-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000001', 'Gym A Plan', 30, 100, (now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date + 30, 'active'),
  ('eeeeeeee-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000002', 'Gym B Plan', 30, 200, (now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date + 30, 'active'),
  ('eeeeeeee-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000005', 'dddddddd-0000-4000-8000-000000000001', 'Gym A Plan', 30, 100, (now() at time zone 'Asia/Kolkata')::date - 40, (now() at time zone 'Asia/Kolkata')::date - 10, 'expired'),
  ('eeeeeeee-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000006', 'dddddddd-0000-4000-8000-000000000001', 'Gym A Plan', 30, 100, (now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date + 30, 'active')
on conflict (id) do nothing;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
select is((select outcome from public.check_in_member('cccccccc-0000-4000-8000-000000000003')),
  'checked_in', 'Gym A can check in a currently eligible Gym A member');
select is((select outcome from public.check_in_member('cccccccc-0000-4000-8000-000000000003')),
  'already_checked_in', 'A second same-day check-in is reported without a duplicate row');
select is((select outcome from public.check_in_member('cccccccc-0000-4000-8000-000000000004')),
  'member_unavailable', 'Gym A cannot create attendance for a Gym B member');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', true);
select is((select outcome from public.check_in_member('cccccccc-0000-4000-8000-000000000004')),
  'checked_in', 'Gym B can create attendance for its own eligible member');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
select is((select count(*) from public.attendance_records where member_id = 'cccccccc-0000-4000-8000-000000000004'),
  0::bigint, 'Gym A cannot read Gym B attendance');
select throws_ok($$update public.attendance_records set notes = 'cross-tenant edit' where member_id = 'cccccccc-0000-4000-8000-000000000004'$$, '42501', null,
  'Gym A cannot modify Gym B attendance through an update');
reset role;
select is((select notes from public.attendance_records where member_id = 'cccccccc-0000-4000-8000-000000000004'),
  null::text, 'Gym B attendance remains unchanged after a Gym A update');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
select throws_ok($$insert into public.attendance_records(gym_id, member_id)
  values ('bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000004')$$, '42501', null,
  'A client-supplied Gym B ID cannot override Gym A attendance authorization');
select is((select outcome from public.check_in_member('cccccccc-0000-4000-8000-000000000006')),
  'member_unavailable', 'Archived members cannot check in');
select is((select outcome from public.check_in_member('cccccccc-0000-4000-8000-000000000005')),
  'membership_invalid', 'Expired memberships cannot check in');
reset role;
set local role anon;
select throws_ok($$select * from public.attendance_records limit 1$$, '42501', null,
  'Unauthenticated users cannot read attendance');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', true);
select is((select count(*) from public.attendance_records where gym_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  1::bigint, 'Platform owner attendance authorization remains unchanged');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', true);
select is((select count(*) from public.attendance_records where member_id = 'cccccccc-0000-4000-8000-000000000003'),
  0::bigint, 'Gym B cannot read Gym A attendance');

-- Phase 5 billing checks append to the 54 previously verified tenant/attendance checks.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
create temporary table phase5_gym_a_revenue_baseline as
  select month_revenue from public.get_gym_dashboard_summary('bbbbbbbb-0000-4000-8000-000000000001');
select lives_ok($$select public.record_member_membership_payment(
  'cccccccc-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000003', 40.25, current_date, 'upi', 'P5-A-1', null)$$,
  'Gym A can record a partial payment for its own membership');
select is((select membership_id from public.member_payments where reference = 'P5-A-1'),
  'eeeeeeee-0000-4000-8000-000000000003'::uuid, 'Payment is linked to the selected membership');
select is((select count(*) from public.member_payments where reference = 'P5-A-1'),
  1::bigint, 'Gym A can read its own member payment');
select is((select status from public.member_payments where reference = 'P5-A-1'),
  'completed', 'Manual membership payments are recorded as completed');
select is((select (payment_date at time zone 'Asia/Kolkata')::date from public.member_payments where reference = 'P5-A-1'),
  current_date, 'The selected payment date is preserved');
select is((select 100 - sum(amount) from public.member_payments where membership_id = 'eeeeeeee-0000-4000-8000-000000000003' and status = 'completed'),
  59.75::numeric, 'Partial payment leaves the correct membership balance');
select throws_ok($$select public.record_member_membership_payment(
  'cccccccc-0000-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-000000000004', 10, current_date, 'cash', null, null)$$,
  '42501', null, 'Gym A cannot create a payment for a Gym B member');
select throws_ok($$select public.record_member_membership_payment(
  'cccccccc-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000003', -1, current_date, 'cash', null, null)$$,
  '23514', null, 'Negative member payments are rejected');
select throws_ok($$select public.record_member_membership_payment(
  'cccccccc-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000003', 1,
  (now() at time zone 'Asia/Kolkata')::date + 1, 'cash', null, null)$$,
  '22023', null, 'Future member payment dates are rejected');
select throws_ok($$insert into public.member_payments(gym_id, member_id, amount, payment_method)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000004', 10, 'cash')$$,
  '42501', null, 'A payment cannot reference a member from another gym');
select throws_ok($$insert into public.member_payments(gym_id, member_id, membership_id, amount, payment_method)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000004', 10, 'cash')$$,
  '42501', null, 'A payment cannot reference another gym member membership');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', true);
select lives_ok($$select public.record_member_membership_payment(
  'cccccccc-0000-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-000000000004', 25, current_date, 'cash', 'P5-B-1', null)$$,
  'Gym B can record its own member payment');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
select is((select count(*) from public.member_payments where reference = 'P5-B-1'),
  0::bigint, 'Gym A cannot read Gym B member payments');
select lives_ok($$update public.member_payments set reference = 'P5-B-MODIFIED' where reference = 'P5-B-1'$$,
  'A Gym A update query cannot modify Gym B payments');
reset role;
select is((select reference from public.member_payments where reference = 'P5-B-1'),
  'P5-B-1', 'Gym B payment remains unchanged after Gym A update');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
select lives_ok($$select public.record_member_membership_payment(
  'cccccccc-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000003', 20.25, current_date, 'card', 'P5-A-2', null)$$,
  'Gym A can record a second partial membership payment');
select is((select sum(amount) from public.member_payments where membership_id = 'eeeeeeee-0000-4000-8000-000000000003' and status = 'completed'),
  60.50::numeric, 'Completed partial payments accumulate against the membership');
select is((select 100 - sum(amount) from public.member_payments where membership_id = 'eeeeeeee-0000-4000-8000-000000000003' and status = 'completed'),
  39.50::numeric, 'Outstanding balance reflects both partial payments');
select throws_ok($$select public.record_member_membership_payment(
  'cccccccc-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000003', 39.51, current_date, 'cash', null, null)$$,
  '22023', null, 'Membership overpayment is rejected');
select lives_ok($$update public.member_payments set status = 'refunded' where reference = 'P5-A-1'$$,
  'A completed payment can be marked refunded without deleting its history');
select is((select month_revenue from public.get_gym_dashboard_summary('bbbbbbbb-0000-4000-8000-000000000001')),
  (select month_revenue + 20.25 from phase5_gym_a_revenue_baseline), 'Refunded payments are excluded from gym revenue');
select is((select count(*) from public.member_payments where reference = 'P5-A-1' and status = 'refunded'),
  1::bigint, 'Refunded payment history remains available');
select ok(exists(select 1 from public.audit_logs where actor_user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
  and gym_id = 'bbbbbbbb-0000-4000-8000-000000000001' and action = 'member_payment.recorded'
  and entity_id = (select id from public.member_payments where reference = 'P5-A-1')),
  'Member payment creation is written to the existing audit log');
select ok(exists(select 1 from public.audit_logs where actor_user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
  and gym_id = 'bbbbbbbb-0000-4000-8000-000000000001' and action = 'member_payment.refunded'
  and entity_id = (select id from public.member_payments where reference = 'P5-A-1')),
  'Member payment refund is written to the existing audit log');
select ok(exists(select 1 from public.audit_logs where actor_user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
  and gym_id = 'bbbbbbbb-0000-4000-8000-000000000001' and action = 'member_payment.recorded'
  and entity_id = (select id from public.member_payments where reference = 'P5-A-2')),
  'The additional partial payment is written to the existing audit log');
select is((select count(*) from public.platform_subscription_payments where gym_id = 'bbbbbbbb-0000-4000-8000-000000000001'), 0::bigint,
  'Gym admin cannot see the separate VYRO platform billing ledger');
reset role;
set local role anon;
select throws_ok($$select * from public.member_payments limit 1$$, '42501', null,
  'Unauthenticated users cannot read member payment records');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', true);
create temporary table phase5_platform_revenue_baseline as
  select month_revenue from public.get_platform_dashboard_summary();
insert into public.platform_subscriptions(id, gym_id, plan_name, amount, currency, starts_on, expires_on, status)
values ('ffffffff-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'P5 Test', 500, 'INR', current_date, current_date + 30, 'trial');
insert into public.platform_subscription_payments(id, gym_id, subscription_id, amount, currency, reference)
values ('ffffffff-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000001', 500, 'INR', 'P5-PLATFORM-1');
select is((select count(*) from public.platform_subscription_payments where reference = 'P5-PLATFORM-1'),
  1::bigint, 'Platform owner retains authorized access to VYRO billing history');
select lives_ok($$update public.platform_subscription_payments set status = 'completed' where reference = 'P5-PLATFORM-1'$$,
  'Platform owner can complete a pending platform payment');
select is((select month_revenue from public.get_platform_dashboard_summary()),
  (select month_revenue + 500 from phase5_platform_revenue_baseline), 'Completed VYRO platform payments count in platform revenue');
select ok(exists(select 1 from public.audit_logs where actor_user_id = 'aaaaaaaa-0000-4000-8000-000000000003'
  and gym_id = 'bbbbbbbb-0000-4000-8000-000000000001' and action = 'platform_payment.recorded'
  and entity_id = 'ffffffff-0000-4000-8000-000000000002'),
  'VYRO platform payment creation is written to the audit log');
select ok(exists(select 1 from public.audit_logs where actor_user_id = 'aaaaaaaa-0000-4000-8000-000000000003'
  and gym_id = 'bbbbbbbb-0000-4000-8000-000000000001' and action = 'platform_payment.status_changed'
  and entity_id = 'ffffffff-0000-4000-8000-000000000002'),
  'VYRO platform payment settlement is written to the audit log');

-- Phase 6 reporting, notification isolation/idempotency, and audit access checks.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
select is((public.get_gym_report('bbbbbbbb-0000-4000-8000-000000000001',
  (now() at time zone 'Asia/Kolkata')::date - 30, (now() at time zone 'Asia/Kolkata')::date)->'members'->>'total')::bigint,
  (select count(*) from public.members where gym_id = 'bbbbbbbb-0000-4000-8000-000000000001'
    and status <> 'archived' and archived_at is null),
  'Gym A report counts only its active, non-archived member data');
select throws_ok($$select public.get_gym_report('bbbbbbbb-0000-4000-8000-000000000002',
  (now() at time zone 'Asia/Kolkata')::date - 7, (now() at time zone 'Asia/Kolkata')::date)$$,
  '42501', null, 'Gym A cannot query Gym B report data');
select throws_ok($$select public.get_platform_report(current_date - 7, current_date)$$,
  '42501', null, 'Gym Admin cannot access platform reports');
select throws_ok($$select public.get_gym_report('bbbbbbbb-0000-4000-8000-000000000001', current_date, current_date - 1)$$,
  '22023', null, 'Invalid report date ranges are rejected in the database');
select is((select count(*) from public.notifications where audience = 'gym' and recipient_user_id = auth.uid()
  and notification_type = 'payment_recorded' and entity_id = (select id from public.member_payments where reference = 'P5-A-1')),
  1::bigint, 'Gym A receives an in-app notification for its recorded payment');
select is((select count(*) from public.notifications where audience = 'gym' and gym_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  0::bigint, 'Gym A cannot read Gym B notifications');
select is((select count(*) from public.audit_logs where gym_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  0::bigint, 'Gym A cannot read Gym B audit logs');
select lives_ok($$select public.sync_in_app_notifications()$$, 'Gym A can generate scoped expiry notifications');
select is((select public.sync_in_app_notifications()), 0, 'Notification expiry generation is idempotent');
select lives_ok($$update public.notifications set is_read = true, read_at = now()
  where recipient_user_id = auth.uid() and audience = 'gym' and notification_type = 'payment_recorded'
    and entity_id = (select id from public.member_payments where reference = 'P5-A-1')$$,
  'Gym A can mark its own notification as read');
select is((select count(*) from public.notifications where recipient_user_id = auth.uid() and audience = 'gym'
  and notification_type = 'payment_recorded' and entity_id = (select id from public.member_payments where reference = 'P5-A-1')
  and is_read and read_at is not null), 1::bigint, 'Read state is stored for the authenticated notification recipient');
select lives_ok($$update public.notifications set is_read = true, read_at = now()
  where recipient_user_id = 'aaaaaaaa-0000-4000-8000-000000000002' and audience = 'gym'$$,
  'Gym A cannot update another gym user notification');
select lives_ok($$select public.set_notification_preference('payment_refunded', false)$$,
  'Gym A can set its own in-app notification preference');
select throws_ok($$insert into public.notifications(recipient_user_id, audience, gym_id, notification_type, title, message, idempotency_key)
  values (auth.uid(), 'gym', 'bbbbbbbb-0000-4000-8000-000000000001', 'payment_recorded', 'Spoofed', 'Spoofed', 'spoofed-event')$$,
  '42501', null, 'Gym Admin cannot directly insert or spoof notification records');
select throws_ok($$insert into public.notification_preferences(user_id, audience, gym_id, event_type, channel, enabled)
  values (auth.uid(), 'gym', 'bbbbbbbb-0000-4000-8000-000000000002', 'payment_recorded', 'in_app', false)$$,
  '42501', null, 'Gym Admin cannot create another gym notification preference');
select is((select enabled from public.notification_preferences where user_id = auth.uid() and audience = 'gym'
  and gym_id = 'bbbbbbbb-0000-4000-8000-000000000001' and event_type = 'payment_refunded' and channel = 'in_app'),
  false, 'Gym notification preference is stored only in Gym A scope');
select throws_ok($$select public.set_notification_preference('gym_subscription_expiring', false)$$,
  '22023', null, 'Gym Admin cannot configure platform notification preferences');
reset role;
select is((select count(*) from public.notifications where recipient_user_id = 'aaaaaaaa-0000-4000-8000-000000000002'
  and audience = 'gym' and notification_type = 'payment_recorded' and not is_read
  and entity_id = (select id from public.member_payments where reference = 'P5-B-1')),
  1::bigint, 'Gym B payment notification remains unread after Gym A update');
set local role anon;
select throws_ok($$select * from public.get_platform_report(current_date - 7, current_date)$$,
  '42501', null, 'Unauthenticated users cannot access platform reports');
select throws_ok($$select * from public.notifications limit 1$$,
  '42501', null, 'Unauthenticated users have no notification table access');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', true);
select lives_ok($$select public.get_platform_report((now() at time zone 'Asia/Kolkata')::date - 30,
  (now() at time zone 'Asia/Kolkata')::date)$$,
  'Platform Owner can access authorized platform reports');
select ok((public.get_platform_report((now() at time zone 'Asia/Kolkata')::date - 30,
  (now() at time zone 'Asia/Kolkata')::date)->'revenue'->>'completed')::numeric >= 500,
  'Platform report revenue includes completed VYRO billing only');
select lives_ok($$select public.sync_in_app_notifications()$$, 'Platform Owner can generate scoped subscription expiry notifications');
select lives_ok($$select public.set_notification_preference('gym_subscription_expiring', false)$$,
  'Platform Owner can set platform notification preferences');
select is((select enabled from public.notification_preferences where user_id = auth.uid() and audience = 'platform'
  and gym_id is null and event_type = 'gym_subscription_expiring' and channel = 'in_app'),
  false, 'Platform notification preference is stored in platform scope');
select ok((select count(*) from public.audit_logs where action = 'platform_payment.recorded') > 0,
  'Platform Owner can access authorized platform audit events');
select ok((select count(*) from public.notifications where recipient_user_id = auth.uid() and audience = 'platform'
  and notification_type = 'platform_payment_recorded') > 0,
  'Platform Owner receives platform billing notifications in the separate audience');

select * from finish();
rollback;
