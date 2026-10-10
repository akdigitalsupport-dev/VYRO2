-- Allow manual member-payment dates without changing the existing payment ledger.
-- The legacy RPC signature remains available and defaults the date to now().

create or replace function public.guard_member_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_timezone text;
  gym_today date;
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

    new.status := 'pending';
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

-- The date is a required fourth argument in this overload. Existing 3-5 argument
-- calls continue to use the legacy wrapper below and retain the current-time default.
create function public.create_member_payment(
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
  if p_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then
    raise exception using errcode = '22023', message = 'Invalid payment method';
  end if;
  if p_reference is not null and char_length(trim(p_reference)) > 120 then
    raise exception using errcode = '22023', message = 'Payment reference is too long';
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception using errcode = '22023', message = 'Payment note is too long';
  end if;
  if not exists (
    select 1
    from public.members m
    where m.id = p_member_id
      and m.gym_id = target_gym_id
  ) then
    raise exception using errcode = '42501', message = 'Member is unavailable';
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
    p_payment_method, 'pending', nullif(trim(p_reference), ''), nullif(trim(p_notes), ''),
    payment_timestamp, payment_timestamp, (select auth.uid())
  )
  returning id into payment_id;

  return payment_id;
end;
$$;

revoke all on function public.create_member_payment(uuid, numeric, text, date, text, text) from public, anon;
grant execute on function public.create_member_payment(uuid, numeric, text, date, text, text) to authenticated, service_role;

-- Preserve the existing RPC contract and its current-time date behavior.
create or replace function public.create_member_payment(
  p_member_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return public.create_member_payment(
    p_member_id,
    p_amount,
    p_payment_method,
    null::date,
    p_reference,
    p_notes
  );
end;
$$;
