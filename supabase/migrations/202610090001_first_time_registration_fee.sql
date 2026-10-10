begin;

alter table public.gym_settings
  add column registration_fee_amount numeric(12,2) not null default 199.00,
  add column registration_fee_enabled boolean not null default true,
  add constraint gym_settings_registration_fee_nonnegative
    check (registration_fee_amount >= 0),
  add constraint gym_settings_registration_fee_enabled_positive
    check (not registration_fee_enabled or registration_fee_amount > 0);

create table public.member_registration_payments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null default 'INR',
  payment_date date not null,
  payment_method text not null check (payment_method in ('cash', 'upi', 'bank_transfer', 'card', 'other')),
  status text not null default 'completed' check (status in ('completed', 'refunded')),
  reference text check (reference is null or char_length(reference) <= 120),
  notes text check (notes is null or char_length(notes) <= 500),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint member_registration_payments_member_gym_fk
    foreign key (member_id, gym_id) references public.members(id, gym_id) on delete cascade,
  constraint member_registration_payments_one_per_member unique (gym_id, member_id)
);

alter table public.member_registration_payments enable row level security;
revoke all on table public.member_registration_payments from public, anon, authenticated, service_role;
grant select on table public.member_registration_payments to authenticated;
create policy "registration payments tenant read"
  on public.member_registration_payments for select to authenticated
  using (public.has_gym_access(gym_id));

create function public.update_gym_registration_settings(
  p_amount numeric,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym_count integer;
  target_gym_id uuid;
begin
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = (select auth.uid()) and gum.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 9999999999.99 or p_amount <> trunc(p_amount, 2) then
    raise exception using errcode = '23514', message = 'Registration fee must be zero or a valid amount with at most two decimal places';
  end if;
  if p_enabled is null or (p_enabled and p_amount = 0) then
    raise exception using errcode = '22023', message = 'An enabled registration fee must be greater than zero';
  end if;

  update public.gym_settings
  set registration_fee_amount = p_amount,
      registration_fee_enabled = p_enabled,
      updated_at = now()
  where gym_id = target_gym_id;
  if not found then raise exception using errcode = 'P0002', message = 'Gym settings are unavailable'; end if;
end;
$$;
revoke all on function public.update_gym_registration_settings(numeric, boolean) from public, anon, service_role;
grant execute on function public.update_gym_registration_settings(numeric, boolean) to authenticated;

-- Old enrollment RPCs remain available to trusted database owners for internal
-- composition, but clients must use the registration-aware atomic entry point.
revoke all on function public.create_gym_member(text, text, text, text, text, date, text, date, text, uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function public.create_gym_member_with_initial_payment(text, text, text, text, text, date, text, date, text, uuid, date, numeric, date, text, text, text)
  from public, anon, authenticated, service_role;

create function public.create_gym_member_with_registration(
  p_member_code text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_gender text,
  p_date_of_birth date,
  p_address text,
  p_joining_date date,
  p_member_notes text,
  p_membership_plan_id uuid,
  p_membership_start_date date,
  p_initial_payment_amount numeric,
  p_payment_date date,
  p_payment_method text,
  p_reference text,
  p_payment_notes text,
  p_registration_payment_date date,
  p_registration_payment_method text,
  p_registration_reference text,
  p_registration_notes text
)
returns table(member_id uuid, membership_id uuid, payment_id uuid, registration_payment_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym_count integer;
  target_gym_id uuid;
  target_fee numeric(12,2);
  fee_enabled boolean;
  target_currency char(3);
  target_timezone text;
  gym_today date;
  created_member_id uuid;
  created_membership_id uuid;
  created_payment_id uuid;
  created_registration_payment_id uuid;
begin
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = (select auth.uid()) and gum.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  select gs.registration_fee_amount, gs.registration_fee_enabled,
         coalesce(gs.currency, 'INR'), coalesce(gs.timezone, 'Asia/Kolkata')
    into target_fee, fee_enabled, target_currency, target_timezone
  from public.gym_settings gs
  where gs.gym_id = target_gym_id
  for update;
  if not found then raise exception using errcode = '42501', message = 'Gym settings are unavailable'; end if;

  if fee_enabled then
    if p_registration_payment_date is null
      or p_registration_payment_method is null
      or p_registration_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then
      raise exception using errcode = '22023', message = 'Registration payment date and method are required';
    end if;
    if p_registration_reference is not null and char_length(trim(p_registration_reference)) > 120 then
      raise exception using errcode = '22023', message = 'Registration payment reference is too long';
    end if;
    if p_registration_notes is not null and char_length(p_registration_notes) > 500 then
      raise exception using errcode = '22023', message = 'Registration payment note is too long';
    end if;
    gym_today := (now() at time zone target_timezone)::date;
    if p_registration_payment_date > gym_today then
      raise exception using errcode = '22023', message = 'Registration payment date cannot be in the future';
    end if;
  end if;

  select e.member_id, e.membership_id, e.payment_id
    into created_member_id, created_membership_id, created_payment_id
  from public.create_gym_member_with_initial_payment(
    p_member_code, p_full_name, p_phone, p_email, p_gender, p_date_of_birth,
    p_address, p_joining_date, p_member_notes, p_membership_plan_id,
    p_membership_start_date, p_initial_payment_amount, p_payment_date,
    p_payment_method, p_reference, p_payment_notes
  ) e;
  if created_member_id is null or created_membership_id is null then
    raise exception using errcode = '40001', message = 'Member enrollment did not complete';
  end if;

  if fee_enabled then
    if exists (
      select 1 from public.member_registration_payments rp
      where rp.gym_id = target_gym_id and rp.member_id = created_member_id
    ) then
      raise exception using errcode = '23505', message = 'Registration payment already exists for this member';
    end if;
    insert into public.member_registration_payments(
      gym_id, member_id, amount, currency, payment_date, payment_method,
      status, reference, notes, recorded_by
    ) values (
      target_gym_id, created_member_id, target_fee, target_currency,
      p_registration_payment_date, p_registration_payment_method, 'completed',
      nullif(trim(p_registration_reference), ''), nullif(trim(p_registration_notes), ''),
      (select auth.uid())
    ) returning id into created_registration_payment_id;
  end if;

  return query select created_member_id, created_membership_id, created_payment_id, created_registration_payment_id;
end;
$$;
revoke all on function public.create_gym_member_with_registration(text, text, text, text, text, date, text, date, text, uuid, date, numeric, date, text, text, text, date, text, text, text)
  from public, anon, service_role;
grant execute on function public.create_gym_member_with_registration(text, text, text, text, text, date, text, date, text, uuid, date, numeric, date, text, text, text, date, text, text, text)
  to authenticated;

create function public.get_gym_revenue_breakdown(p_from date, p_to date)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  gym_count integer;
  target_gym_id uuid;
  target_timezone text;
  result jsonb;
begin
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = (select auth.uid()) and gum.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception using errcode = '22023', message = 'Invalid revenue date range';
  end if;
  select coalesce(gs.timezone, 'Asia/Kolkata') into target_timezone
  from public.gym_settings gs where gs.gym_id = target_gym_id;
  target_timezone := coalesce(target_timezone, 'Asia/Kolkata');

  with membership_days as (
    select (mp.payment_date at time zone target_timezone)::date as day, sum(mp.amount)::numeric(14,2) as amount
    from public.member_payments mp
    where mp.gym_id = target_gym_id and mp.status = 'completed'
      and (mp.payment_date at time zone target_timezone)::date between p_from and p_to
    group by 1
  ), registration_days as (
    select rp.payment_date as day, sum(rp.amount)::numeric(14,2) as amount
    from public.member_registration_payments rp
    where rp.gym_id = target_gym_id and rp.status = 'completed'
      and rp.payment_date between p_from and p_to
    group by 1
  ), days as (
    select day, sum(membership_amount)::numeric(14,2) as membership_amount,
           sum(registration_amount)::numeric(14,2) as registration_amount
    from (
      select day, amount as membership_amount, 0::numeric as registration_amount from membership_days
      union all
      select day, 0::numeric, amount from registration_days
    ) combined group by day
  )
  select jsonb_build_object(
    'membership_revenue', coalesce((select sum(amount) from membership_days), 0),
    'registration_revenue', coalesce((select sum(amount) from registration_days), 0),
    'total_revenue', coalesce((select sum(amount) from membership_days), 0) + coalesce((select sum(amount) from registration_days), 0),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object(
      'date', day, 'membership_amount', membership_amount,
      'registration_amount', registration_amount,
      'amount', membership_amount + registration_amount
    ) order by day) from days), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_gym_revenue_breakdown(date, date) from public, anon, service_role;
grant execute on function public.get_gym_revenue_breakdown(date, date) to authenticated;

commit;
