-- Allow free-plan renewals through the same atomic membership RPC without a zero payment.
create or replace function public.assign_membership_and_record_payment(
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
  if p_start_date is null then raise exception using errcode = '22023', message = 'Membership start date is required'; end if;
  if p_reference is not null and char_length(trim(p_reference)) > 120 then raise exception using errcode = '22023', message = 'Payment reference is too long'; end if;
  if p_notes is not null and char_length(p_notes) > 500 then raise exception using errcode = '22023', message = 'Payment note is too long'; end if;

  select coalesce(gs.currency, 'INR'), coalesce(gs.timezone, 'Asia/Kolkata')
    into target_currency, target_timezone
  from public.gym_settings gs where gs.gym_id = target_gym_id;
  target_currency := coalesce(target_currency, 'INR');
  target_timezone := coalesce(target_timezone, 'Asia/Kolkata');
  gym_today := (now() at time zone target_timezone)::date;
  if p_payment_date is not null and p_payment_date > gym_today then
    raise exception using errcode = '22023', message = 'Payment date cannot be in the future';
  end if;
  payment_timestamp := case when p_payment_date is null then now() else p_payment_date::timestamp at time zone target_timezone end;

  created_membership_id := public.assign_member_membership(p_member_id, p_membership_plan_id, p_start_date);
  select mm.price_snapshot into target_amount
  from public.member_memberships mm
  where mm.id = created_membership_id and mm.member_id = p_member_id and mm.gym_id = target_gym_id;
  if not found or target_amount is null then raise exception using errcode = '42501', message = 'Created membership is unavailable'; end if;

  if target_amount > 0 then
    if p_payment_method is null or p_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then
      raise exception using errcode = '22023', message = 'Invalid payment method';
    end if;
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
