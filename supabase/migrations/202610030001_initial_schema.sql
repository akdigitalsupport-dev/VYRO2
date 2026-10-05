-- VYRO core schema. Tenant access is enforced in PostgreSQL, not in the UI.
create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  owner_name text,
  phone text,
  email text,
  address text,
  status text not null default 'active' check (status in ('active', 'expiring', 'expired', 'suspended')),
  logo_path text,
  branding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'gym_admin'
    check (role in ('platform_owner', 'gym_admin', 'trainer', 'receptionist', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gym_user_memberships (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'gym_admin'
    check (role in ('gym_admin', 'trainer', 'receptionist', 'member')),
  created_at timestamptz not null default now(),
  unique (gym_id, user_id)
);
create index gym_user_memberships_user_idx on public.gym_user_memberships(user_id, gym_id);

create table public.platform_subscriptions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete restrict,
  plan_name text not null check (char_length(trim(plan_name)) between 1 and 120),
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null default 'INR',
  starts_on date not null,
  expires_on date not null,
  status text not null default 'active' check (status in ('active', 'expired', 'suspended', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_on >= starts_on),
  unique (id, gym_id)
);
create index platform_subscriptions_renewal_idx on public.platform_subscriptions(status, expires_on);
create index platform_subscriptions_gym_idx on public.platform_subscriptions(gym_id, expires_on desc);

-- VYRO billing collections are intentionally distinct from member_payments below.
create table public.platform_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null,
  gym_id uuid not null references public.gyms(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null default 'INR',
  paid_at timestamptz not null default now(),
  reference text,
  status text not null default 'paid' check (status in ('paid', 'refunded', 'failed')),
  created_at timestamptz not null default now(),
  foreign key (subscription_id, gym_id)
    references public.platform_subscriptions(id, gym_id) on delete restrict
);
create index platform_subscription_payments_paid_at_idx on public.platform_subscription_payments(paid_at desc);

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  duration_days integer not null check (duration_days > 0),
  price numeric(12,2) not null check (price >= 0),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, name),
  unique (id, gym_id)
);
create index membership_plans_gym_active_idx on public.membership_plans(gym_id, is_active, name);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_code text not null,
  full_name text not null check (char_length(trim(full_name)) between 1 and 160),
  phone text,
  email text,
  gender text check (gender is null or gender in ('female', 'male', 'non_binary', 'prefer_not_to_say')),
  date_of_birth date,
  address text,
  membership_plan_id uuid,
  membership_starts_on date,
  membership_expires_on date,
  status text not null default 'active' check (status in ('active', 'expiring', 'expired', 'paused', 'archived')),
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, member_code),
  unique (id, gym_id),
  foreign key (membership_plan_id, gym_id)
    references public.membership_plans(id, gym_id) on delete set null (membership_plan_id),
  check (membership_expires_on is null or membership_starts_on is null or membership_expires_on >= membership_starts_on),
  check ((status = 'archived') = (archived_at is not null))
);
create index members_gym_status_created_idx on public.members(gym_id, status, created_at desc);
create index members_gym_name_idx on public.members(gym_id, full_name);
create index members_gym_expiry_idx on public.members(gym_id, membership_expires_on) where archived_at is null;

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null,
  checked_in_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'qr', 'device')),
  recorded_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (member_id, gym_id) references public.members(id, gym_id) on delete cascade
);
create index attendance_gym_time_idx on public.attendance_records(gym_id, checked_in_at desc);
create index attendance_member_time_idx on public.attendance_records(gym_id, member_id, checked_in_at desc);

create table public.member_payments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null default 'INR',
  paid_at timestamptz not null default now(),
  payment_method text not null check (payment_method in ('cash', 'upi', 'card', 'bank_transfer', 'other')),
  reference text,
  notes text,
  status text not null default 'paid' check (status in ('paid', 'refunded', 'void')),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (member_id, gym_id) references public.members(id, gym_id) on delete restrict
);
create index member_payments_gym_paid_idx on public.member_payments(gym_id, paid_at desc);
create index member_payments_member_idx on public.member_payments(gym_id, member_id, paid_at desc);

create table public.gym_settings (
  gym_id uuid primary key references public.gyms(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata',
  currency char(3) not null default 'INR',
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  brand_name text not null default 'VYRO' check (char_length(trim(brand_name)) between 1 and 120),
  support_email text,
  default_currency char(3) not null default 'INR',
  default_timezone text not null default 'Asia/Kolkata',
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  gym_id uuid references public.gyms(id) on delete set null,
  action text not null check (char_length(trim(action)) between 1 and 120),
  entity_type text not null check (char_length(trim(entity_type)) between 1 and 120),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_gym_created_idx on public.audit_logs(gym_id, created_at desc);
create index audit_logs_actor_created_idx on public.audit_logs(actor_user_id, created_at desc);

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger gyms_set_updated_at before update on public.gyms
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.user_profiles
for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.platform_subscriptions
for each row execute function public.set_updated_at();
create trigger plans_set_updated_at before update on public.membership_plans
for each row execute function public.set_updated_at();
create trigger members_set_updated_at before update on public.members
for each row execute function public.set_updated_at();
create trigger gym_settings_set_updated_at before update on public.gym_settings
for each row execute function public.set_updated_at();
create trigger platform_settings_set_updated_at before update on public.platform_settings
for each row execute function public.set_updated_at();

create function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_profiles(user_id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger auth_user_profile_created after insert on auth.users
for each row execute function public.handle_new_auth_user();

create function public.write_audit_event()
returns trigger language plpgsql set search_path = '' as $$
declare
  target_gym_id uuid;
  target_entity_id uuid;
  audit_action text;
  audit_entity text;
  audit_metadata jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'gyms' then
    target_gym_id := new.id;
  elsif tg_table_name = 'platform_settings' then
    target_gym_id := null;
  else
    target_gym_id := new.gym_id;
  end if;
  if tg_table_name = 'platform_settings' then
    target_entity_id := null;
  else
    target_entity_id := new.id;
  end if;
  if tg_table_name = 'gyms' then
    audit_action := case when tg_op = 'INSERT' then 'gym.created' else 'gym.updated' end;
    audit_entity := 'gym';
    if tg_op = 'UPDATE' then
      if new.status is distinct from old.status then
        audit_action := 'gym.status_changed';
        audit_metadata := jsonb_build_object('from', old.status, 'to', new.status);
      end if;
    end if;
  elsif tg_table_name = 'platform_subscriptions' then
    audit_action := case when tg_op = 'INSERT' then 'subscription.created' else 'subscription.updated' end;
    audit_entity := 'platform_subscription';
  elsif tg_table_name = 'platform_subscription_payments' then
    audit_action := 'platform_payment.recorded';
    audit_entity := 'platform_subscription_payment';
  elsif tg_table_name = 'membership_plans' then
    audit_action := case when tg_op = 'INSERT' then 'membership_plan.created' else 'membership_plan.updated' end;
    audit_entity := 'membership_plan';
  elsif tg_table_name = 'members' then
    audit_action := case when tg_op = 'INSERT' then 'member.created' else 'member.updated' end;
    audit_entity := 'member';
  elsif tg_table_name = 'attendance_records' then
    audit_action := 'attendance.checked_in';
    audit_entity := 'attendance_record';
  elsif tg_table_name = 'member_payments' then
    audit_action := 'member_payment.recorded';
    audit_entity := 'member_payment';
  elsif tg_table_name = 'gym_settings' then
    audit_action := case when tg_op = 'INSERT' then 'gym_settings.created' else 'gym_settings.updated' end;
    audit_entity := 'gym_settings';
  else
    audit_action := 'platform_settings.updated';
    audit_entity := 'platform_setting';
  end if;

  insert into public.audit_logs(actor_user_id, gym_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), target_gym_id, audit_action, audit_entity,
    target_entity_id,
    audit_metadata
  );
  return new;
end;
$$;

create trigger gyms_audit_event after insert or update on public.gyms
for each row execute function public.write_audit_event();
create trigger subscriptions_audit_event after insert or update on public.platform_subscriptions
for each row execute function public.write_audit_event();
create trigger platform_payments_audit_event after insert or update on public.platform_subscription_payments
for each row execute function public.write_audit_event();
create trigger plans_audit_event after insert or update on public.membership_plans
for each row execute function public.write_audit_event();
create trigger members_audit_event after insert or update on public.members
for each row execute function public.write_audit_event();
create trigger attendance_audit_event after insert or update on public.attendance_records
for each row execute function public.write_audit_event();
create trigger member_payments_audit_event after insert or update on public.member_payments
for each row execute function public.write_audit_event();
create trigger gym_settings_audit_event after insert or update on public.gym_settings
for each row execute function public.write_audit_event();
create trigger platform_settings_audit_event after update on public.platform_settings
for each row execute function public.write_audit_event();

create function public.create_gym_defaults()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.gym_settings(gym_id) values (new.id);
  return new;
end;
$$;
create trigger gyms_create_settings after insert on public.gyms
for each row execute function public.create_gym_defaults();

-- SECURITY DEFINER helpers avoid recursive RLS queries when policies inspect role tables.
create function public.is_platform_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'platform_owner'
  );
$$;

create function public.has_gym_access(target_gym_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_owner() or exists (
    select 1 from public.gym_user_memberships m
    where m.user_id = (select auth.uid())
      and m.gym_id = target_gym_id
      and m.role = 'gym_admin'
  );
$$;

revoke all on function public.is_platform_owner() from public;
revoke all on function public.has_gym_access(uuid) from public;
grant execute on function public.is_platform_owner() to authenticated;
grant execute on function public.has_gym_access(uuid) to authenticated;

alter table public.gyms enable row level security;
alter table public.user_profiles enable row level security;
alter table public.gym_user_memberships enable row level security;
alter table public.platform_subscriptions enable row level security;
alter table public.platform_subscription_payments enable row level security;
alter table public.membership_plans enable row level security;
alter table public.members enable row level security;
alter table public.attendance_records enable row level security;
alter table public.member_payments enable row level security;
alter table public.gym_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_settings enable row level security;

-- Expose only the minimum table operations needed by the authenticated application.
revoke all on public.gyms, public.user_profiles, public.gym_user_memberships,
  public.platform_subscriptions, public.platform_subscription_payments,
  public.membership_plans, public.members, public.attendance_records,
  public.member_payments, public.gym_settings, public.audit_logs, public.platform_settings from anon, authenticated;
grant select on public.gyms, public.user_profiles, public.gym_user_memberships,
  public.platform_subscriptions, public.platform_subscription_payments,
  public.membership_plans, public.members, public.attendance_records,
  public.member_payments, public.gym_settings, public.audit_logs, public.platform_settings to authenticated;
grant insert, update on public.gyms to authenticated;
grant insert, update on public.platform_subscriptions, public.platform_subscription_payments to authenticated;
grant insert, update on public.membership_plans, public.members to authenticated;
grant insert on public.attendance_records, public.member_payments, public.audit_logs to authenticated;
grant update on public.attendance_records, public.member_payments, public.gym_settings to authenticated;
grant insert on public.gym_settings to authenticated;
grant update on public.platform_settings to authenticated;
grant update (display_name) on public.user_profiles to authenticated;

create policy "profiles read self or platform" on public.user_profiles
  for select to authenticated using (user_id = (select auth.uid()) or public.is_platform_owner());
create policy "profiles update own display name" on public.user_profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "memberships read own or platform" on public.gym_user_memberships
  for select to authenticated using (user_id = (select auth.uid()) or public.is_platform_owner());

create policy "gyms read authorized" on public.gyms
  for select to authenticated using (public.has_gym_access(id));
create policy "platform owners manage gyms" on public.gyms
  for all to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner());

create policy "subscriptions read authorized" on public.platform_subscriptions
  for select to authenticated using (public.has_gym_access(gym_id));
create policy "platform owners manage subscriptions" on public.platform_subscriptions
  for all to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner());
create policy "platform billing read platform owners" on public.platform_subscription_payments
  for select to authenticated using (public.is_platform_owner());
create policy "platform billing manage platform owners" on public.platform_subscription_payments
  for all to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner());

create policy "plans tenant access" on public.membership_plans
  for all to authenticated using (public.has_gym_access(gym_id)) with check (public.has_gym_access(gym_id));
create policy "members tenant access" on public.members
  for all to authenticated using (public.has_gym_access(gym_id)) with check (public.has_gym_access(gym_id));
create policy "attendance tenant access" on public.attendance_records
  for all to authenticated using (public.has_gym_access(gym_id)) with check (public.has_gym_access(gym_id));
create policy "member payments tenant access" on public.member_payments
  for all to authenticated using (public.has_gym_access(gym_id)) with check (public.has_gym_access(gym_id));
create policy "gym settings tenant access" on public.gym_settings
  for all to authenticated using (public.has_gym_access(gym_id)) with check (public.has_gym_access(gym_id));

create policy "audit read authorized" on public.audit_logs
  for select to authenticated using (
    public.is_platform_owner() or (gym_id is not null and public.has_gym_access(gym_id))
  );
create policy "audit insert as self" on public.audit_logs
  for insert to authenticated with check (
    actor_user_id = (select auth.uid())
    and (gym_id is null or public.has_gym_access(gym_id))
  );
create policy "platform settings owner only" on public.platform_settings
  for all to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner());

create function public.get_platform_dashboard_summary()
returns table (
  total_gyms bigint,
  active_gyms bigint,
  expiring_gyms bigint,
  inactive_gyms bigint,
  active_members bigint,
  month_revenue numeric,
  upcoming_renewals bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  platform_timezone text;
begin
  if not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  select ps.default_timezone into platform_timezone from public.platform_settings ps where ps.id = 1;
  platform_timezone := coalesce(platform_timezone, 'Asia/Kolkata');

  return query select
    (select count(*) from public.gyms),
    (select count(*) from public.gyms g where g.status = 'active'),
    (select count(*) from public.gyms g where g.status = 'expiring' or exists (
      select 1 from public.platform_subscriptions s
      where s.gym_id = g.id and s.status = 'active'
        and s.expires_on between (now() at time zone platform_timezone)::date
          and (now() at time zone platform_timezone)::date + 30
    )),
    (select count(*) from public.gyms g where g.status in ('expired', 'suspended')),
    (select count(*) from public.members m where m.status = 'active' and m.archived_at is null),
    (select coalesce(sum(p.amount), 0) from public.platform_subscription_payments p
      where p.status = 'paid'
        and p.paid_at >= date_trunc('month', now() at time zone platform_timezone)::timestamp at time zone platform_timezone
        and p.paid_at < (date_trunc('month', now() at time zone platform_timezone) + interval '1 month')::timestamp at time zone platform_timezone),
    (select count(*) from public.platform_subscriptions s
      where s.status = 'active'
        and s.expires_on between (now() at time zone platform_timezone)::date
          and (now() at time zone platform_timezone)::date + 30);
end;
$$;

create function public.get_gym_dashboard_summary(target_gym_id uuid)
returns table (
  total_members bigint,
  active_members bigint,
  expiring_members bigint,
  today_attendance bigint,
  month_revenue numeric
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  gym_timezone text;
begin
  if not exists (
    select 1 from public.gym_user_memberships m
    where m.user_id = (select auth.uid())
      and m.gym_id = target_gym_id
      and m.role = 'gym_admin'
  ) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  select coalesce(gs.timezone, 'Asia/Kolkata') into gym_timezone
  from public.gym_settings gs where gs.gym_id = target_gym_id;
  gym_timezone := coalesce(gym_timezone, 'Asia/Kolkata');

  return query select
    (select count(*) from public.members m where m.gym_id = target_gym_id and m.archived_at is null),
    (select count(*) from public.members m where m.gym_id = target_gym_id and m.status = 'active' and m.archived_at is null),
    (select count(*) from public.members m where m.gym_id = target_gym_id and m.status in ('expiring', 'expired') and m.archived_at is null),
    (select count(*) from public.attendance_records a where a.gym_id = target_gym_id
      and a.checked_in_at >= ((now() at time zone gym_timezone)::date::timestamp at time zone gym_timezone)
      and a.checked_in_at < (((now() at time zone gym_timezone)::date + 1)::timestamp at time zone gym_timezone)),
    (select coalesce(sum(p.amount), 0) from public.member_payments p
      where p.gym_id = target_gym_id and p.status = 'paid'
        and p.paid_at >= date_trunc('month', now() at time zone gym_timezone)::timestamp at time zone gym_timezone
        and p.paid_at < (date_trunc('month', now() at time zone gym_timezone) + interval '1 month')::timestamp at time zone gym_timezone);
end;
$$;

create function public.provision_gym_admin(target_gym_id uuid, target_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  insert into public.gym_user_memberships(gym_id, user_id, role)
  values (target_gym_id, target_user_id, 'gym_admin')
  on conflict (gym_id, user_id) do update set role = 'gym_admin';
  insert into public.audit_logs(actor_user_id, gym_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), target_gym_id, 'gym.admin_provisioned', 'gym_admin', target_user_id, '{}'::jsonb);
end;
$$;

revoke all on function public.get_platform_dashboard_summary() from public;
revoke all on function public.get_gym_dashboard_summary(uuid) from public;
revoke all on function public.provision_gym_admin(uuid, uuid) from public;
grant execute on function public.get_platform_dashboard_summary() to authenticated;
grant execute on function public.get_gym_dashboard_summary(uuid) to authenticated;
grant execute on function public.provision_gym_admin(uuid, uuid) to authenticated;

-- There are intentionally no authenticated insert/update/delete policies on role or membership tables.
-- Provision platform owners, gym admins, and tenant links through a reviewed trusted admin workflow.
