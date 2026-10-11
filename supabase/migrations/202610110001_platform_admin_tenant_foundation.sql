begin;

-- Atomically provision a new tenant, owner membership, defaults, and free-trial
-- subscription. The calling session must be an authenticated Platform Owner.
-- Owner authentication invitation is handled server-side before this RPC runs.
create or replace function public.provision_platform_trial_gym(
  p_owner_user_id uuid,
  p_gym_name text,
  p_owner_name text,
  p_owner_email text,
  p_owner_phone text,
  p_address text,
  p_trial_days integer,
  p_starts_on date
)
returns table (gym_id uuid, subscription_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gym_id uuid;
  v_subscription_id uuid;
  v_owner_email text;
begin
  if (select auth.uid()) is null or not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'Not authorized to provision a gym';
  end if;

  if p_owner_user_id is null
    or p_gym_name is null or char_length(trim(p_gym_name)) not between 2 and 160
    or p_owner_name is null or char_length(trim(p_owner_name)) not between 1 and 120
    or p_owner_email is null or char_length(trim(p_owner_email)) not between 3 and 254
    or p_owner_phone is not null and char_length(trim(p_owner_phone)) > 40
    or p_address is not null and char_length(trim(p_address)) > 1000
    or p_trial_days is null or p_trial_days not between 1 and 90
    or p_starts_on is null then
    raise exception using errcode = '22023', message = 'Gym or trial details are invalid';
  end if;

  select lower(trim(u.email)) into v_owner_email
  from auth.users u
  join public.user_profiles p on p.user_id = u.id
  where u.id = p_owner_user_id and p.role = 'gym_admin';

  if v_owner_email is null or v_owner_email <> lower(trim(p_owner_email)) then
    raise exception using errcode = '22023', message = 'The invited owner account could not be verified';
  end if;

  if exists (
    select 1 from public.gym_user_memberships m where m.user_id = p_owner_user_id
  ) then
    raise exception using errcode = '23505', message = 'This account is already assigned to a gym';
  end if;

  insert into public.gyms (name, owner_name, phone, email, address, status)
  values (
    trim(p_gym_name),
    trim(p_owner_name),
    nullif(trim(coalesce(p_owner_phone, '')), ''),
    lower(trim(p_owner_email)),
    nullif(trim(coalesce(p_address, '')), ''),
    'active'
  )
  returning id into v_gym_id;

  -- gyms_create_settings creates the per-tenant settings row from the existing trigger.
  update public.user_profiles
  set role = 'gym_admin', display_name = trim(p_owner_name)
  where user_id = p_owner_user_id;

  insert into public.gym_user_memberships (gym_id, user_id, role)
  values (v_gym_id, p_owner_user_id, 'gym_admin');

  insert into public.platform_subscriptions (
    gym_id, plan_name, amount, currency, starts_on, expires_on, status, billing_period
  )
  values (
    v_gym_id, 'Free Trial', 0, 'INR', p_starts_on,
    p_starts_on + (p_trial_days - 1), 'trial', 'monthly'
  )
  returning id into v_subscription_id;

  return query select v_gym_id, v_subscription_id;
end;
$$;

revoke all on function public.provision_platform_trial_gym(uuid, text, text, text, text, text, integer, date) from public, anon;
grant execute on function public.provision_platform_trial_gym(uuid, text, text, text, text, text, integer, date) to authenticated;

commit;
