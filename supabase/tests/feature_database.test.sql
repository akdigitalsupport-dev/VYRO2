begin;
create extension if not exists pgtap;
select plan(21);

-- Disposable transaction-local fixtures for the final membership/billing,
-- backup-restore, and Web Push database contracts.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'feature-admin@example.test', '', now(), '{}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.user_profiles(user_id, role)
values ('aaaaaaaa-0000-4000-8000-000000000021', 'gym_admin')
on conflict (user_id) do update set role = excluded.role;
insert into public.gyms(id, name) values
  ('bbbbbbbb-0000-4000-8000-000000000021', 'Feature Test Gym'),
  ('bbbbbbbb-0000-4000-8000-000000000022', 'Other Feature Gym')
on conflict (id) do nothing;
insert into public.gym_user_memberships(gym_id, user_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000021', 'aaaaaaaa-0000-4000-8000-000000000021', 'gym_admin')
on conflict (gym_id, user_id) do nothing;
update public.gym_settings set registration_fee_amount = 199, registration_fee_enabled = true,
  timezone = 'Asia/Kolkata', currency = 'INR'
where gym_id = 'bbbbbbbb-0000-4000-8000-000000000021';
insert into public.membership_plans(id, gym_id, name, duration_days, price) values
  ('dddddddd-0000-4000-8000-000000000021', 'bbbbbbbb-0000-4000-8000-000000000021', 'Feature Plan', 30, 100)
on conflict (id) do nothing;
insert into public.members(id, gym_id, member_code, full_name, joining_date, status, archived_at) values
  ('cccccccc-0000-4000-8000-000000000021', 'bbbbbbbb-0000-4000-8000-000000000021', 'BACKUP-SOURCE', 'Backup Source Member', current_date - 1, 'active', null),
  ('cccccccc-0000-4000-8000-000000000022', 'bbbbbbbb-0000-4000-8000-000000000021', 'EXPIRING-MEMBER', 'Expiring Member', current_date - 60, 'active', null),
  ('cccccccc-0000-4000-8000-000000000023', 'bbbbbbbb-0000-4000-8000-000000000021', 'EXPIRED-MEMBER', 'Expired Member', current_date - 60, 'active', null),
  ('cccccccc-0000-4000-8000-000000000024', 'bbbbbbbb-0000-4000-8000-000000000021', 'ARCHIVED-MEMBER', 'Archived Member', current_date - 60, 'archived', now()),
  ('cccccccc-0000-4000-8000-000000000025', 'bbbbbbbb-0000-4000-8000-000000000021', 'CANCELLED-MEMBER', 'Cancelled Member', current_date - 60, 'active', null)
on conflict (id) do nothing;
insert into public.member_memberships(id, gym_id, member_id, membership_plan_id,
  plan_name_snapshot, duration_days_snapshot, price_snapshot, start_date, end_date, status)
values
  ('eeeeeeee-0000-4000-8000-000000000021', 'bbbbbbbb-0000-4000-8000-000000000021', 'cccccccc-0000-4000-8000-000000000021', 'dddddddd-0000-4000-8000-000000000021', 'Feature Plan', 30, 100, current_date, current_date + 30, 'active'),
  ('eeeeeeee-0000-4000-8000-000000000022', 'bbbbbbbb-0000-4000-8000-000000000021', 'cccccccc-0000-4000-8000-000000000022', 'dddddddd-0000-4000-8000-000000000021', 'Feature Plan', 30, 100, (now() at time zone 'Asia/Kolkata')::date - 27, (now() at time zone 'Asia/Kolkata')::date + 3, 'active'),
  ('eeeeeeee-0000-4000-8000-000000000023', 'bbbbbbbb-0000-4000-8000-000000000021', 'cccccccc-0000-4000-8000-000000000023', 'dddddddd-0000-4000-8000-000000000021', 'Feature Plan', 30, 100, (now() at time zone 'Asia/Kolkata')::date - 30, (now() at time zone 'Asia/Kolkata')::date, 'active'),
  ('eeeeeeee-0000-4000-8000-000000000024', 'bbbbbbbb-0000-4000-8000-000000000021', 'cccccccc-0000-4000-8000-000000000024', 'dddddddd-0000-4000-8000-000000000021', 'Feature Plan', 30, 100, (now() at time zone 'Asia/Kolkata')::date - 27, (now() at time zone 'Asia/Kolkata')::date + 3, 'active'),
  ('eeeeeeee-0000-4000-8000-000000000025', 'bbbbbbbb-0000-4000-8000-000000000021', 'cccccccc-0000-4000-8000-000000000025', 'dddddddd-0000-4000-8000-000000000021', 'Feature Plan', 30, 100, (now() at time zone 'Asia/Kolkata')::date - 27, (now() at time zone 'Asia/Kolkata')::date + 3, 'cancelled');
insert into public.push_subscriptions(id, user_id, gym_id, endpoint, p256dh, auth_key)
values ('ffffffff-0000-4000-8000-000000000021', 'aaaaaaaa-0000-4000-8000-000000000021',
  'bbbbbbbb-0000-4000-8000-000000000021', 'https://push.example.test/subscription/feature-21',
  'p256dh-test-value-aaaaaaaaaaaa', 'auth-key-test-value');

-- Valid snapshot copies source rows with fresh primary keys, as when restoring
-- into a separate empty database.
create temporary table feature_backup_payload as
select jsonb_build_object(
  'manifest', jsonb_build_object('format', 'VYRO', 'version', '1', 'gym_id', 'bbbbbbbb-0000-4000-8000-000000000021'),
  'data', jsonb_build_object(
    'gym', (select to_jsonb(g) from public.gyms g where g.id = 'bbbbbbbb-0000-4000-8000-000000000021'),
    'settings', (select to_jsonb(gs) from public.gym_settings gs where gs.gym_id = 'bbbbbbbb-0000-4000-8000-000000000021'),
    'plans', jsonb_build_array((select to_jsonb(p) || jsonb_build_object('id', 'dddddddd-0000-4000-8000-000000000026', 'name', 'Restored Plan')
      from public.membership_plans p where p.id = 'dddddddd-0000-4000-8000-000000000021')),
    'members', jsonb_build_array((select to_jsonb(m) || jsonb_build_object('id', 'cccccccc-0000-4000-8000-000000000026', 'member_code', 'RESTORED-MEMBER')
      from public.members m where m.id = 'cccccccc-0000-4000-8000-000000000021')),
    'memberships', jsonb_build_array((select to_jsonb(mm) || jsonb_build_object(
      'id', 'eeeeeeee-0000-4000-8000-000000000026', 'member_id', 'cccccccc-0000-4000-8000-000000000026',
      'membership_plan_id', 'dddddddd-0000-4000-8000-000000000026', 'plan_name_snapshot', 'Restored Plan',
      'start_date', (now() at time zone 'Asia/Kolkata')::date, 'end_date', (now() at time zone 'Asia/Kolkata')::date + 30, 'status', 'active')
      from public.member_memberships mm where mm.id = 'eeeeeeee-0000-4000-8000-000000000021')),
    'payments', '[]'::jsonb, 'attendance', '[]'::jsonb, 'trainers', '[]'::jsonb,
    'expenses', '[]'::jsonb, 'notification_preferences', '[]'::jsonb
  )
) as document;
grant select on feature_backup_payload to authenticated;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000021', true);
set local role authenticated;

select lives_ok($$select public.create_gym_member_with_registration(
  'REG-CHARGED', 'Charged Registration Member', '+91 90000 00021', 'charged@example.test', null, null,
  null, (now() at time zone 'Asia/Kolkata')::date, null, 'dddddddd-0000-4000-8000-000000000021',
  (now() at time zone 'Asia/Kolkata')::date, 0, null, null, null, null,
  (now() at time zone 'Asia/Kolkata')::date, 'cash', 'REG-RECEIPT-21', null, true)$$,
  'Registration fee is created atomically when selected');
select is((select amount from public.member_registration_payments where reference = 'REG-RECEIPT-21'),
  199::numeric, 'Registration amount uses the configured server-side snapshot');
select is((select status from public.member_registration_payments where reference = 'REG-RECEIPT-21'),
  'completed', 'Registration transaction is recorded as completed');
select is((select count(*) from public.member_payments p join public.members m on m.id = p.member_id
  where m.member_code = 'REG-CHARGED'), 0::bigint, 'Registration does not create or reduce membership payment balance');

reset role;
update public.gym_settings set registration_fee_enabled = false where gym_id = 'bbbbbbbb-0000-4000-8000-000000000021';
set local role authenticated;
select lives_ok($$select public.create_gym_member_with_registration(
  'REG-DISABLED', 'Disabled Registration Member', '+91 90000 00022', 'disabled@example.test', null, null,
  null, (now() at time zone 'Asia/Kolkata')::date, null, 'dddddddd-0000-4000-8000-000000000021',
  (now() at time zone 'Asia/Kolkata')::date, 0, null, null, null, null, null, null, null, null, true)$$,
  'Globally disabled registration fee does not block enrollment');
select is((select count(*) from public.member_registration_payments rp join public.members m on m.id = rp.member_id
  where m.member_code = 'REG-DISABLED'), 0::bigint, 'Globally disabled registration fee creates no ledger entry');

reset role;
update public.gym_settings set registration_fee_enabled = true where gym_id = 'bbbbbbbb-0000-4000-8000-000000000021';
set local role authenticated;
select throws_ok($$select public.create_gym_member_with_registration(
  'REG-FUTURE', 'Future Registration Member', '+91 90000 00023', 'future@example.test', null, null,
  null, (now() at time zone 'Asia/Kolkata')::date, null, 'dddddddd-0000-4000-8000-000000000021',
  (now() at time zone 'Asia/Kolkata')::date, 0, null, null, null, null,
  (now() at time zone 'Asia/Kolkata')::date + 1, 'cash', null, null, true)$$,
  '22023', null, 'Future registration payment date is rejected');
select is((select count(*) from public.members where member_code = 'REG-FUTURE'),
  0::bigint, 'Failed registration enrollment leaves no partial member record');

select lives_ok($$select public.restore_gym_operational_backup((select document from feature_backup_payload))$$,
  'Authenticated Gym Admin can restore a tenant-scoped backup');
select is((select count(*) from public.members m join public.member_memberships mm on mm.member_id = m.id and mm.gym_id = m.gym_id
  join public.membership_plans p on p.id = mm.membership_plan_id and p.gym_id = mm.gym_id
  where m.id = 'cccccccc-0000-4000-8000-000000000026' and p.id = 'dddddddd-0000-4000-8000-000000000026'
    and mm.id = 'eeeeeeee-0000-4000-8000-000000000026' and m.gym_id = 'bbbbbbbb-0000-4000-8000-000000000021'),
  1::bigint, 'Restore creates member, plan, and membership under the authenticated gym');
select throws_ok($$select public.restore_gym_operational_backup(jsonb_build_object(
  'manifest', jsonb_build_object('format', 'VYRO', 'version', '1', 'gym_id', 'bbbbbbbb-0000-4000-8000-000000000021'),
  'data', jsonb_build_object('gym', jsonb_build_object('id', 'bbbbbbbb-0000-4000-8000-000000000022'),
    'settings', jsonb_build_object('gym_id', 'bbbbbbbb-0000-4000-8000-000000000022'))))$$,
  '42501', null, 'Restore rejects a backup whose data claims another gym');

select throws_ok($$select public.materialize_membership_expiry_notifications()$$,
  '42501', null, 'Authenticated users cannot run the service-only notification scheduler');
reset role;
set local role service_role;
select is(public.materialize_membership_expiry_notifications(), 2,
  'Scheduler creates one expiry event and one three-day warning');
reset role;
select is((select count(*) from public.membership_notification_events where gym_id = 'bbbbbbbb-0000-4000-8000-000000000021'),
  2::bigint, 'Scheduler excludes archived members and cancelled memberships');
select is((select count(*) from public.notifications where recipient_user_id = 'aaaaaaaa-0000-4000-8000-000000000021'
  and audience = 'gym' and gym_id = 'bbbbbbbb-0000-4000-8000-000000000021'
  and notification_type in ('membership_expiring', 'membership_expired')), 2::bigint,
  'Each logical membership event creates an in-app notification');
select is((select count(*) from public.push_delivery_attempts d join public.notifications n on n.id = d.notification_id
  where n.recipient_user_id = 'aaaaaaaa-0000-4000-8000-000000000021'), 2::bigint,
  'Each notification queues delivery for the active device subscription');
set local role service_role;
select is(public.materialize_membership_expiry_notifications(), 0,
  'Repeated scheduler execution is idempotent');
select is((select count(*) from public.claim_push_delivery_attempts(1)), 1::bigint,
  'Service role can claim a queued delivery attempt');
reset role;
select is((select attempt_count from public.push_delivery_attempts where subscription_id = 'ffffffff-0000-4000-8000-000000000021'
  and status = 'processing' limit 1), 1, 'First delivery claim records its attempt count');
set local role service_role;
update public.push_delivery_attempts set status = 'failed', next_attempt_at = now() - interval '1 second', last_error = 'simulated failure'
where subscription_id = 'ffffffff-0000-4000-8000-000000000021' and status = 'processing';
select is((select count(*) from public.claim_push_delivery_attempts(1)), 1::bigint,
  'A failed delivery becomes eligible for a safe retry');
reset role;
select is((select attempt_count from public.push_delivery_attempts where subscription_id = 'ffffffff-0000-4000-8000-000000000021'
  and status = 'processing' order by attempt_count desc limit 1), 2,
  'Retry increments the delivery attempt counter');

select * from finish();
rollback;
