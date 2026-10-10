begin;

-- Preserve owner-only interactive subscription writes while permitting the existing
-- secret-authenticated Vercel cron (service_role JWT) to perform valid expiry transitions.
create or replace function public.guard_platform_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner() and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Not authorized to manage VYRO subscriptions';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and not (
    (old.status = 'trial' and new.status in ('active', 'past_due', 'expired', 'suspended', 'cancelled')) or
    (old.status = 'active' and new.status in ('past_due', 'expired', 'suspended', 'cancelled')) or
    (old.status = 'past_due' and new.status in ('active', 'expired', 'suspended', 'cancelled')) or
    (old.status = 'suspended' and new.status in ('active', 'expired', 'cancelled')) or
    (old.status = 'expired' and new.status in ('active', 'cancelled'))
  ) then
    raise exception using errcode = '23514', message = 'Invalid VYRO subscription status transition';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_platform_subscription() from public, anon, authenticated;

create or replace function public.expire_platform_subscriptions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_today date;
  v_count integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Only the scheduled service can expire platform subscriptions';
  end if;

  select coalesce(ps.default_timezone, 'Asia/Kolkata')
    into v_timezone
  from public.platform_settings ps
  where ps.id = 1;
  v_timezone := coalesce(v_timezone, 'Asia/Kolkata');
  begin
    v_today := (now() at time zone v_timezone)::date;
  exception when invalid_parameter_value then
    v_timezone := 'Asia/Kolkata';
    v_today := (now() at time zone v_timezone)::date;
  end;

  update public.platform_subscriptions
  set status = 'expired'
  where status in ('trial', 'active', 'past_due')
    and expires_on < v_today;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.expire_platform_subscriptions() from public, anon, authenticated;
grant execute on function public.expire_platform_subscriptions() to service_role;

commit;
