-- Close archived-member payment gaps and provide one atomic membership/payment RPC.
-- Existing RLS, schemas, and the legacy RPC signatures remain unchanged.

begin;

create or replace function public.guard_member_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_timezone text;
  gym_today date;
  authorized_member_id uuid;
begin
  if not exists (
    select 1
    from public.gym_user_memberships m
    where m.user_id = (select auth.uid())
      and m.gym_id = new.gym_id
      and m.role = 'gym_admin'
  ) then
    raise exception using errcode = '42501', message = 'Not authorized to manage member payments for this gym';
  end if;

  if tg_op = 'INSERT' then
    -- The row lock prevents a concurrent archive from racing a payment insert.
    select m.id into authorized_member_id
    from public.members m
    where m.id = new.member_id
      and m.gym_id = new.gym_id
      and m.status <> 'archived'
      and m.archived_at is null
    for share;
    if not found then
      raise exception using errcode = '42501', message = 'Member is unavailable or archived';
    end if;

    select coalesce(gs.timezone, 'Asia/Kolkata')
      into target_timezone
    from public.gym_settings gs
    where gs.gym_id = new.gym_id;
    target_timezone := coalesce(target_timezone, 'Asia/Kolkata');
    gym_today := (now() at time zone target_timezone)::date;

    new.payment_date := coalesce(new.payment_date, now());
    if (new.payment_date at time zone target_timezone)::date > gym_today then
      raise exception using errcode = '22023', message = 'Payment date cannot be in the future';
    end if;

    new.status := 'completed';
    new.paid_at := new.payment_date;
    new.recorded_by := (select auth.uid());
    return new;
  end if;

  if (new.gym_id, new.member_id, new.membership_id, new.amount, new.currency, new.payment_method,
      new.payment_date, new.paid_at, new.reference, new.provider_name, new.provider_reference,
      new.recorded_by) is distinct from
     (old.gym_id, old.member_id, old.membership_id, old.amount, old.currency, old.payment_method,
      old.payment_date, old.paid_at, old.reference, old.provider_name, old.provider_reference,
      old.recorded_by) then
    raise exception using errcode = '42501', message = 'Recorded payment details are immutable';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'pending' and new.status in ('completed', 'failed', 'cancelled')) or
    (old.status = 'completed' and new.status = 'refunded')
  ) then
    raise exception using errcode = '23514', message = 'Invalid member payment status transition';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- The trigger is still callable only by the table trigger and database owner roles.
revoke all on function public.guard_member_payment() from public, anon, authenticated;

create or replace function public.create_member_payment(
  p_member_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date,
  p_reference text,
  p_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  gym_count integer;
  target_gym_id uuid;
  target_currency char(3);
  target_timezone text;
  gym_today date;
  target_membership_id uuid;
  payment_id uuid;
  payment_timestamp timestamptz;
  member_status text;
  member_archived_at timestamptz;
begin
  select count(*)::integer, (array_agg(m.gym_id order by m.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships m
  where m.user_id = (select auth.uid())
    and m.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 9999999999.99 or p_amount <> trunc(p_amount, 2) then
    raise exception using errcode = '23514', message = 'Payment amount must be positive and use at most two decimal places';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then
    raise exception using errcode = '22023', message = 'Invalid payment method';
  end if;
  if p_reference is not null and char_length(trim(p_reference)) > 120 then
    raise exception using errcode = '22023', message = 'Payment reference is too long';
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception using errcode = '22023', message = 'Payment note is too long';
  end if;

  -- Lock the member row so archival cannot race this RPC.
  select m.status, m.archived_at
    into member_status, member_archived_at
  from public.members m
  where m.id = p_member_id
    and m.gym_id = target_gym_id
  for update;
  if not found or member_status = 'archived' or member_archived_at is not null then
    raise exception using errcode = '42501', message = 'Member is unavailable or archived';
  end if;

  select coalesce(gs.currency, 'INR'), coalesce(gs.timezone, 'Asia/Kolkata')
    into target_currency, target_timezone
  from public.gym_settings gs
  where gs.gym_id = target_gym_id;
  target_currency := coalesce(target_currency, 'INR');
  target_timezone := coalesce(target_timezone, 'Asia/Kolkata');
  gym_today := (now() at time zone target_timezone)::date;

  if p_payment_date is not null and p_payment_date > gym_today then
    raise exception using errcode = '22023', message = 'Payment date cannot be in the future';
  end if;
  payment_timestamp := case
    when p_payment_date is null then now()
    else p_payment_date::timestamp at time zone target_timezone
  end;

  select mm.id into target_membership_id
  from public.member_memberships mm
  where mm.member_id = p_member_id
    and mm.gym_id = target_gym_id
    and mm.status = 'active'
    and mm.start_date <= gym_today
    and mm.end_date >= gym_today
  order by mm.start_date desc, mm.created_at desc, mm.id desc
  limit 1;

  insert into public.member_payments(
    gym_id, member_id, membership_id, amount, currency, payment_method, status,
    reference, notes, payment_date, paid_at, recorded_by
  ) values (
    target_gym_id, p_member_id, target_membership_id, p_amount, target_currency,
    p_payment_method, 'completed', nullif(trim(p_reference), ''), nullif(trim(p_notes), ''),
    payment_timestamp, payment_timestamp, (select auth.uid())
  )
  returning id into payment_id;

  return payment_id;
end;
$$;

revoke all on function public.create_member_payment(uuid, numeric, text, date, text, text) from public, anon;
grant execute on function public.create_member_payment(uuid, numeric, text, date, text, text) to authenticated, service_role;

-- Preserve the existing assignment contract while also recognizing archived_at.
create or replace function public.assign_member_membership(
  p_member_id uuid,
  p_membership_plan_id uuid,
  p_start_date date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  gym_count integer;
  target_gym_id uuid;
  plan_duration integer;
  plan_name text;
  plan_price numeric(12,2);
  new_membership_id uuid;
  member_joining_date date;
begin
  select count(*)::integer, (array_agg(m.gym_id order by m.gym_id))[1] into gym_count, target_gym_id
  from public.gym_user_memberships m
  where m.user_id = (select auth.uid()) and m.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select m.joining_date into member_joining_date
  from public.members m
  where m.id = p_member_id and m.gym_id = target_gym_id
    and m.status <> 'archived' and m.archived_at is null
  for update;
  if member_joining_date is null then
    raise exception using errcode = '42501', message = 'Member is unavailable';
  end if;
  if p_start_date < member_joining_date then
    raise exception using errcode = '22023', message = 'Membership cannot start before joining date';
  end if;

  select p.duration_days, p.name, p.price into plan_duration, plan_name, plan_price
  from public.membership_plans p
  where p.id = p_membership_plan_id and p.gym_id = target_gym_id and p.is_active;
  if plan_duration is null then
    raise exception using errcode = '42501', message = 'Membership plan is unavailable';
  end if;
  if exists (
    select 1 from public.member_memberships mm
    where mm.member_id = p_member_id and mm.gym_id = target_gym_id
      and mm.status in ('active', 'expired')
      and daterange(mm.start_date, mm.end_date, '[]')
          && daterange(p_start_date, p_start_date + plan_duration, '[]')
  ) then
    raise exception using errcode = '23P01', message = 'Membership dates overlap existing history';
  end if;

  update public.member_memberships mm set status = 'expired'
  where mm.member_id = p_member_id and mm.gym_id = target_gym_id
    and mm.status = 'active' and mm.end_date < p_start_date;
  update public.members set status = 'active'
  where id = p_member_id and gym_id = target_gym_id;
  insert into public.member_memberships(
    gym_id, member_id, membership_plan_id, plan_name_snapshot,
    duration_days_snapshot, price_snapshot, start_date, end_date, status
  ) values (
    target_gym_id, p_member_id, p_membership_plan_id, plan_name,
    plan_duration, plan_price,
    p_start_date, p_start_date + plan_duration, 'active'
  ) returning id into new_membership_id;
  return new_membership_id;
end;
$$;

revoke all on function public.assign_member_membership(uuid, uuid, date) from public, anon;
grant execute on function public.assign_member_membership(uuid, uuid, date) to authenticated, service_role;

-- One invoker-context RPC makes renewal/assignment and its manual payment atomic.
-- It delegates membership and tenant validation to the existing assignment RPC;
-- any subsequent payment error rolls the membership changes back with this transaction.
create function public.assign_membership_and_record_payment(
  p_member_id uuid,
  p_membership_plan_id uuid,
  p_start_date date,
  p_payment_date date,
  p_payment_method text,
  p_reference text default null,
  p_notes text default null
)
returns table(membership_id uuid, payment_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  gym_count integer;
  target_gym_id uuid;
  target_currency char(3);
  target_timezone text;
  gym_today date;
  payment_timestamp timestamptz;
  created_membership_id uuid;
  created_payment_id uuid;
  target_amount numeric(12,2);
begin
  select count(*)::integer, (array_agg(m.gym_id order by m.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships m
  where m.user_id = (select auth.uid()) and m.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_start_date is null then
    raise exception using errcode = '22023', message = 'Membership start date is required';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then
    raise exception using errcode = '22023', message = 'Invalid payment method';
  end if;
  if p_reference is not null and char_length(trim(p_reference)) > 120 then
    raise exception using errcode = '22023', message = 'Payment reference is too long';
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception using errcode = '22023', message = 'Payment note is too long';
  end if;

  select coalesce(gs.currency, 'INR'), coalesce(gs.timezone, 'Asia/Kolkata')
    into target_currency, target_timezone
  from public.gym_settings gs
  where gs.gym_id = target_gym_id;
  target_currency := coalesce(target_currency, 'INR');
  target_timezone := coalesce(target_timezone, 'Asia/Kolkata');
  gym_today := (now() at time zone target_timezone)::date;
  if p_payment_date is not null and p_payment_date > gym_today then
    raise exception using errcode = '22023', message = 'Payment date cannot be in the future';
  end if;
  payment_timestamp := case
    when p_payment_date is null then now()
    else p_payment_date::timestamp at time zone target_timezone
  end;

  created_membership_id := public.assign_member_membership(
    p_member_id, p_membership_plan_id, p_start_date
  );

  select mm.price_snapshot into target_amount
  from public.member_memberships mm
  where mm.id = created_membership_id
    and mm.member_id = p_member_id
    and mm.gym_id = target_gym_id;
  if not found or target_amount is null then
    raise exception using errcode = '42501', message = 'Created membership is unavailable';
  end if;

  -- Free plans have no payment row because member_payments requires amount > 0.
  if target_amount > 0 then
    insert into public.member_payments(
      gym_id, member_id, membership_id, amount, currency, payment_method, status,
      reference, notes, payment_date, paid_at, recorded_by
    ) values (
      target_gym_id, p_member_id, created_membership_id, target_amount, target_currency,
      p_payment_method, 'completed', nullif(trim(p_reference), ''), nullif(trim(p_notes), ''),
      payment_timestamp, payment_timestamp, (select auth.uid())
    ) returning id into created_payment_id;
  end if;

  return query select created_membership_id, created_payment_id;
end;
$$;

revoke all on function public.assign_membership_and_record_payment(uuid, uuid, date, date, text, text, text) from public, anon, service_role;
grant execute on function public.assign_membership_and_record_payment(uuid, uuid, date, date, text, text, text) to authenticated;

-- The existing create_gym_member RPC creates the member and initial membership.
-- This companion makes a paid initial enrollment and its payment one transaction.
create function public.create_gym_member_and_record_payment(
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
  p_payment_date date,
  p_payment_method text,
  p_reference text default null,
  p_payment_notes text default null
)
returns table(member_id uuid, membership_id uuid, payment_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  gym_count integer;
  target_gym_id uuid;
  target_currency char(3);
  target_timezone text;
  gym_today date;
  payment_timestamp timestamptz;
  created_member_id uuid;
  created_membership_id uuid;
  created_payment_id uuid;
  target_amount numeric(12,2);
begin
  select count(*)::integer, (array_agg(m.gym_id order by m.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships m
  where m.user_id = (select auth.uid()) and m.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  select coalesce(gs.currency, 'INR'), coalesce(gs.timezone, 'Asia/Kolkata')
    into target_currency, target_timezone
  from public.gym_settings gs
  where gs.gym_id = target_gym_id;
  target_currency := coalesce(target_currency, 'INR');
  target_timezone := coalesce(target_timezone, 'Asia/Kolkata');
  gym_today := (now() at time zone target_timezone)::date;
  payment_timestamp := case
    when p_payment_date is null then now()
    else p_payment_date::timestamp at time zone target_timezone
  end;

  created_member_id := public.create_gym_member(
    p_member_code, p_full_name, p_phone, p_email, p_gender, p_date_of_birth,
    p_address, p_joining_date, p_member_notes, p_membership_plan_id, p_membership_start_date
  );

  select mm.id, mm.price_snapshot
    into created_membership_id, target_amount
  from public.member_memberships mm
  where mm.member_id = created_member_id
    and mm.gym_id = target_gym_id
    and mm.membership_plan_id = p_membership_plan_id
    and mm.start_date = p_membership_start_date;
  if not found or created_membership_id is null or target_amount is null then
    raise exception using errcode = '42501', message = 'Created membership is unavailable';
  end if;

  if target_amount > 0 then
    if p_payment_method is null or p_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then
      raise exception using errcode = '22023', message = 'Invalid payment method';
    end if;
    if p_reference is not null and char_length(trim(p_reference)) > 120 then
      raise exception using errcode = '22023', message = 'Payment reference is too long';
    end if;
    if p_payment_notes is not null and char_length(p_payment_notes) > 500 then
      raise exception using errcode = '22023', message = 'Payment note is too long';
    end if;
    if p_payment_date is not null and p_payment_date > gym_today then
      raise exception using errcode = '22023', message = 'Payment date cannot be in the future';
    end if;

    insert into public.member_payments(
      gym_id, member_id, membership_id, amount, currency, payment_method, status,
      reference, notes, payment_date, paid_at, recorded_by
    ) values (
      target_gym_id, created_member_id, created_membership_id, target_amount,
      target_currency, p_payment_method, 'completed', nullif(trim(p_reference), ''),
      nullif(trim(p_payment_notes), ''), payment_timestamp, payment_timestamp, (select auth.uid())
    ) returning id into created_payment_id;
  end if;

  return query select created_member_id, created_membership_id, created_payment_id;
end;
$$;

revoke all on function public.create_gym_member_and_record_payment(text, text, text, text, text, date, text, date, text, uuid, date, date, text, text, text) from public, anon, service_role;
grant execute on function public.create_gym_member_and_record_payment(text, text, text, text, text, date, text, date, text, uuid, date, date, text, text, text) to authenticated;

commit;
