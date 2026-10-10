begin;

-- Membership snapshots are the billing total. Completed member_payments rows
-- remain the payment ledger; no duplicated balance columns or tables are added.

create or replace function public.guard_member_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_timezone text;
  gym_today date;
  member_is_archived boolean;
  membership_price numeric(12,2);
  paid_total numeric;
  outstanding numeric;
  must_validate_completion boolean;
begin
  if not exists (
    select 1 from public.gym_user_memberships gum
    where gum.user_id = (select auth.uid())
      and gum.gym_id = new.gym_id
      and gum.role = 'gym_admin'
  ) then
    raise exception using errcode = '42501', message = 'Not authorized to manage member payments for this gym';
  end if;

  must_validate_completion := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    must_validate_completion := old.status is distinct from new.status and new.status = 'completed';
  end if;

  if must_validate_completion then
    select (m.status = 'archived' or m.archived_at is not null)
      into member_is_archived
    from public.members m
    where m.id = new.member_id and m.gym_id = new.gym_id
    for share;
    if not found or member_is_archived then
      raise exception using errcode = '42501', message = 'Member is unavailable or archived';
    end if;
    if new.membership_id is null
      and coalesce(pg_catalog.current_setting('vyro.trusted_backup_restore', true), '') <> 'on' then
      raise exception using errcode = '23514', message = 'A payment must belong to a membership';
    end if;
    if new.membership_id is not null then
      select mm.price_snapshot into membership_price
      from public.member_memberships mm
      where mm.id = new.membership_id
        and mm.member_id = new.member_id
        and mm.gym_id = new.gym_id
        and mm.status <> 'cancelled'
      for update;
      if not found then
        raise exception using errcode = '42501', message = 'Membership is unavailable for this member';
      end if;
    end if;
    if new.amount is null or new.amount <= 0 or new.amount > 9999999999.99 or new.amount <> trunc(new.amount, 2) then
      raise exception using errcode = '23514', message = 'Payment amount must be positive and use at most two decimal places';
    end if;

    select coalesce(gs.timezone, 'Asia/Kolkata') into target_timezone
    from public.gym_settings gs where gs.gym_id = new.gym_id;
    target_timezone := coalesce(target_timezone, 'Asia/Kolkata');
    gym_today := (now() at time zone target_timezone)::date;
    if tg_op = 'INSERT' then new.payment_date := coalesce(new.payment_date, now()); end if;
    if (new.payment_date at time zone target_timezone)::date > gym_today then
      raise exception using errcode = '22023', message = 'Payment date cannot be in the future';
    end if;

    if new.membership_id is not null
      and coalesce(pg_catalog.current_setting('vyro.trusted_backup_restore', true), '') <> 'on' then
      select coalesce(sum(p.amount), 0) into paid_total
      from public.member_payments p
      where p.membership_id = new.membership_id and p.gym_id = new.gym_id
        and p.status = 'completed';
      outstanding := greatest(membership_price - coalesce(paid_total, 0), 0);
      if new.amount > outstanding then
        raise exception using errcode = '22023', message = 'PAYMENT_EXCEEDS_OUTSTANDING:' || outstanding::text;
      end if;
    end if;

    if tg_op = 'INSERT' then
      new.status := 'completed';
      new.paid_at := new.payment_date;
      new.recorded_by := (select auth.uid());
      return new;
    end if;
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
revoke all on function public.guard_member_payment() from public, anon, authenticated;

-- Explicit membership association, server-derived gym, locked balance check,
-- and payment insert are one transaction. The trigger repeats the cap check so
-- direct PostgREST inserts cannot bypass it.
create function public.record_member_membership_payment(
  p_member_id uuid,
  p_membership_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text,
  p_reference text default null,
  p_notes text default null
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
  payment_timestamp timestamptz;
  membership_price numeric(12,2);
  paid_total numeric;
  outstanding numeric;
  payment_id uuid;
begin
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = (select auth.uid()) and gum.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9999999999.99 or p_amount <> trunc(p_amount, 2) then
    raise exception using errcode = '23514', message = 'Payment amount must be positive and use at most two decimal places';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then
    raise exception using errcode = '22023', message = 'Invalid payment method';
  end if;
  if p_payment_date is null then
    raise exception using errcode = '22023', message = 'Payment date is required';
  end if;
  if p_reference is not null and char_length(trim(p_reference)) > 120 then
    raise exception using errcode = '22023', message = 'Payment reference is too long';
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception using errcode = '22023', message = 'Payment note is too long';
  end if;

  perform 1 from public.members m
  where m.id = p_member_id and m.gym_id = target_gym_id
    and m.status <> 'archived' and m.archived_at is null
  for update;
  if not found then raise exception using errcode = '42501', message = 'Member is unavailable or archived'; end if;

  select mm.price_snapshot into membership_price
  from public.member_memberships mm
  where mm.id = p_membership_id and mm.member_id = p_member_id
    and mm.gym_id = target_gym_id and mm.status <> 'cancelled'
  for update;
  if not found then raise exception using errcode = '42501', message = 'Membership is unavailable for this member'; end if;

  select coalesce(gs.currency, 'INR'), coalesce(gs.timezone, 'Asia/Kolkata')
    into target_currency, target_timezone
  from public.gym_settings gs where gs.gym_id = target_gym_id;
  target_currency := coalesce(target_currency, 'INR');
  target_timezone := coalesce(target_timezone, 'Asia/Kolkata');
  gym_today := (now() at time zone target_timezone)::date;
  if p_payment_date > gym_today then
    raise exception using errcode = '22023', message = 'Payment date cannot be in the future';
  end if;
  payment_timestamp := p_payment_date::timestamp at time zone target_timezone;

  select coalesce(sum(p.amount), 0) into paid_total
  from public.member_payments p
  where p.membership_id = p_membership_id and p.gym_id = target_gym_id and p.status = 'completed';
  outstanding := greatest(membership_price - paid_total, 0);
  if p_amount > outstanding then
    raise exception using errcode = '22023', message = 'PAYMENT_EXCEEDS_OUTSTANDING:' || outstanding::text;
  end if;

  insert into public.member_payments(
    gym_id, member_id, membership_id, amount, currency, payment_method, status,
    reference, notes, payment_date, paid_at, recorded_by
  ) values (
    target_gym_id, p_member_id, p_membership_id, p_amount, target_currency,
    p_payment_method, 'completed', nullif(trim(p_reference), ''), nullif(trim(p_notes), ''),
    payment_timestamp, payment_timestamp, (select auth.uid())
  ) returning id into payment_id;
  return payment_id;
end;
$$;
revoke all on function public.record_member_membership_payment(uuid, uuid, numeric, date, text, text, text) from public, anon, service_role;
grant execute on function public.record_member_membership_payment(uuid, uuid, numeric, date, text, text, text) to authenticated;

-- Preserve the legacy function objects for rollback/history, but prevent callers
-- from using their old implicit-membership association contract.
revoke all on function public.create_member_payment(uuid, numeric, text, date, text, text) from public, anon, authenticated, service_role;
revoke all on function public.create_member_payment(uuid, numeric, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.assign_membership_and_record_payment(uuid, uuid, date, date, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.create_gym_member_and_record_payment(text, text, text, text, text, date, text, date, text, uuid, date, date, text, text, text) from public, anon, authenticated, service_role;

create function public.assign_membership_with_payment(
  p_member_id uuid,
  p_membership_plan_id uuid,
  p_start_date date,
  p_payment_amount numeric,
  p_payment_date date default null,
  p_payment_method text default null,
  p_reference text default null,
  p_notes text default null
)
returns table(membership_id uuid, payment_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_membership_id uuid;
  target_price numeric(12,2);
  payment_amount numeric := coalesce(p_payment_amount, 0);
  gym_count integer;
  target_gym_id uuid;
  target_currency char(3);
  target_timezone text;
  gym_today date;
  payment_timestamp timestamptz;
  created_payment_id uuid;
begin
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = (select auth.uid()) and gum.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then raise exception using errcode = '42501', message = 'Not authorized'; end if;
  if payment_amount < 0 or payment_amount > 9999999999.99 or payment_amount <> trunc(payment_amount, 2) then
    raise exception using errcode = '23514', message = 'Payment must be zero or a positive amount with at most two decimal places';
  end if;

  created_membership_id := public.assign_member_membership(p_member_id, p_membership_plan_id, p_start_date);
  select mm.price_snapshot into target_price
  from public.member_memberships mm
  where mm.id = created_membership_id and mm.member_id = p_member_id and mm.gym_id = target_gym_id;
  if not found then raise exception using errcode = '42501', message = 'Created membership is unavailable'; end if;
  if payment_amount > target_price then
    raise exception using errcode = '22023', message = 'PAYMENT_EXCEEDS_OUTSTANDING:' || target_price::text;
  end if;
  if payment_amount > 0 then
    if p_payment_method is null or p_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then
      raise exception using errcode = '22023', message = 'Invalid payment method';
    end if;
    if p_payment_date is null then raise exception using errcode = '22023', message = 'Payment date is required'; end if;
    if p_reference is not null and char_length(trim(p_reference)) > 120 then raise exception using errcode = '22023', message = 'Payment reference is too long'; end if;
    if p_notes is not null and char_length(p_notes) > 500 then raise exception using errcode = '22023', message = 'Payment note is too long'; end if;
    select coalesce(gs.currency, 'INR'), coalesce(gs.timezone, 'Asia/Kolkata') into target_currency, target_timezone
    from public.gym_settings gs where gs.gym_id = target_gym_id;
    target_currency := coalesce(target_currency, 'INR');
    target_timezone := coalesce(target_timezone, 'Asia/Kolkata');
    gym_today := (now() at time zone target_timezone)::date;
    if p_payment_date > gym_today then raise exception using errcode = '22023', message = 'Payment date cannot be in the future'; end if;
    payment_timestamp := p_payment_date::timestamp at time zone target_timezone;
    insert into public.member_payments(
      gym_id, member_id, membership_id, amount, currency, payment_method, status,
      reference, notes, payment_date, paid_at, recorded_by
    ) values (
      target_gym_id, p_member_id, created_membership_id, payment_amount, target_currency,
      p_payment_method, 'completed', nullif(trim(p_reference), ''), nullif(trim(p_notes), ''),
      payment_timestamp, payment_timestamp, (select auth.uid())
    ) returning id into created_payment_id;
  end if;
  return query select created_membership_id, created_payment_id;
end;
$$;
revoke all on function public.assign_membership_with_payment(uuid, uuid, date, numeric, date, text, text, text) from public, anon, service_role;
grant execute on function public.assign_membership_with_payment(uuid, uuid, date, numeric, date, text, text, text) to authenticated;

create function public.create_gym_member_with_initial_payment(
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
  p_payment_date date default null,
  p_payment_method text default null,
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
  target_price numeric(12,2);
  payment_amount numeric := coalesce(p_initial_payment_amount, 0);
  created_member_id uuid;
  created_membership_id uuid;
  created_payment_id uuid;
begin
  select count(*)::integer, (array_agg(gum.gym_id order by gum.gym_id))[1]
    into gym_count, target_gym_id
  from public.gym_user_memberships gum
  where gum.user_id = (select auth.uid()) and gum.role = 'gym_admin';
  if gym_count <> 1 or target_gym_id is null then raise exception using errcode = '42501', message = 'Not authorized'; end if;
  if payment_amount < 0 or payment_amount > 9999999999.99 or payment_amount <> trunc(payment_amount, 2) then
    raise exception using errcode = '23514', message = 'Payment must be zero or a positive amount with at most two decimal places';
  end if;

  created_member_id := public.create_gym_member(
    p_member_code, p_full_name, p_phone, p_email, p_gender, p_date_of_birth,
    p_address, p_joining_date, p_member_notes, p_membership_plan_id, p_membership_start_date
  );
  select mm.id, mm.price_snapshot into created_membership_id, target_price
  from public.member_memberships mm
  where mm.member_id = created_member_id and mm.gym_id = target_gym_id
    and mm.membership_plan_id = p_membership_plan_id and mm.start_date = p_membership_start_date
  order by mm.created_at desc, mm.id desc limit 1;
  if not found or created_membership_id is null then raise exception using errcode = '42501', message = 'Created membership is unavailable'; end if;
  if payment_amount > target_price then
    raise exception using errcode = '22023', message = 'PAYMENT_EXCEEDS_OUTSTANDING:' || target_price::text;
  end if;

  if payment_amount > 0 then
    if p_payment_method is null or p_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then raise exception using errcode = '22023', message = 'Invalid payment method'; end if;
    if p_payment_date is null then raise exception using errcode = '22023', message = 'Payment date is required'; end if;
    if p_reference is not null and char_length(trim(p_reference)) > 120 then raise exception using errcode = '22023', message = 'Payment reference is too long'; end if;
    if p_payment_notes is not null and char_length(p_payment_notes) > 500 then raise exception using errcode = '22023', message = 'Payment note is too long'; end if;
    select coalesce(gs.currency, 'INR'), coalesce(gs.timezone, 'Asia/Kolkata') into target_currency, target_timezone
    from public.gym_settings gs where gs.gym_id = target_gym_id;
    target_currency := coalesce(target_currency, 'INR');
    target_timezone := coalesce(target_timezone, 'Asia/Kolkata');
    gym_today := (now() at time zone target_timezone)::date;
    if p_payment_date > gym_today then raise exception using errcode = '22023', message = 'Payment date cannot be in the future'; end if;
    payment_timestamp := p_payment_date::timestamp at time zone target_timezone;
    insert into public.member_payments(
      gym_id, member_id, membership_id, amount, currency, payment_method, status,
      reference, notes, payment_date, paid_at, recorded_by
    ) values (
      target_gym_id, created_member_id, created_membership_id, payment_amount, target_currency,
      p_payment_method, 'completed', nullif(trim(p_reference), ''), nullif(trim(p_payment_notes), ''),
      payment_timestamp, payment_timestamp, (select auth.uid())
    ) returning id into created_payment_id;
  end if;
  return query select created_member_id, created_membership_id, created_payment_id;
end;
$$;
revoke all on function public.create_gym_member_with_initial_payment(text, text, text, text, text, date, text, date, text, uuid, date, numeric, date, text, text, text) from public, anon, service_role;
grant execute on function public.create_gym_member_with_initial_payment(text, text, text, text, text, date, text, date, text, uuid, date, numeric, date, text, text, text) to authenticated;

-- Backups preserve legacy financial history exactly, including any historical
-- overpayment. The restore RPC validates the authenticated tenant and all row
-- references before entering this narrowly scoped transaction-local mode.
do $migration$
declare
  restore_definition text;
  original_fragment text := '  for row_json in select value from jsonb_array_elements(data->''payments'') loop';
  restore_fragment text := '  perform pg_catalog.set_config(''vyro.trusted_backup_restore'', ''on'', true);' || chr(10) || original_fragment;
  end_fragment text := '    restored_payments := restored_payments + 1;' || chr(10) || '  end loop;';
  reset_fragment text := '    restored_payments := restored_payments + 1;' || chr(10) || '  end loop;' || chr(10) || '  perform pg_catalog.set_config(''vyro.trusted_backup_restore'', ''off'', true);';
begin
  restore_definition := pg_catalog.pg_get_functiondef('public.restore_gym_operational_backup(jsonb)'::regprocedure);
  if pg_catalog.strpos(restore_definition, 'vyro.trusted_backup_restore') > 0 then
    raise exception 'Backup restore already has a billing bypass marker; review before applying';
  end if;
  if pg_catalog.strpos(restore_definition, original_fragment) = 0
    or pg_catalog.strpos(restore_definition, end_fragment) = 0 then
    raise exception 'Backup restore function does not match the expected migration 007 body';
  end if;
  restore_definition := pg_catalog.replace(restore_definition, original_fragment, restore_fragment);
  restore_definition := pg_catalog.replace(restore_definition, end_fragment, reset_fragment);
  execute restore_definition;
end;
$migration$;

commit;
