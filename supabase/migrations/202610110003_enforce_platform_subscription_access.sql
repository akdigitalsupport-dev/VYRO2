begin;

-- Prevent suspended or expired customer workspaces from continuing to access tenant
-- data through direct PostgREST/RLS routes. Accounts created before VYRO billing exists
-- remain accessible until a platform subscription is explicitly assigned.
create or replace function public.has_gym_access(target_gym_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_owner() or exists (
    select 1
    from public.gym_user_memberships m
    join public.gyms g on g.id = m.gym_id
    left join public.gym_settings gs on gs.gym_id = g.id
    left join lateral (
      select s.status, s.expires_on
      from public.platform_subscriptions s
      where s.gym_id = g.id
      order by s.starts_on desc, s.created_at desc, s.id desc
      limit 1
    ) latest on true
    where m.user_id = (select auth.uid())
      and m.gym_id = target_gym_id
      and m.role = 'gym_admin'
      and g.status not in ('expired', 'suspended')
      and (
        latest.status is null
        or (
          latest.status not in ('suspended', 'expired', 'cancelled')
          and latest.expires_on >= (
            now() at time zone coalesce(gs.timezone, 'Asia/Kolkata')
          )::date
        )
      )
  );
$$;
revoke all on function public.has_gym_access(uuid) from public;
grant execute on function public.has_gym_access(uuid) to authenticated;

-- Platform Owner action updates the workspace status and, when suspending, suspends
-- its newest current subscription in the same transaction. Reactivating a gym does not
-- silently reactivate its paid subscription; that requires payment and lifecycle checks.
create or replace function public.set_platform_gym_status(
  p_gym_id uuid,
  p_status text
)
returns table (gym_id uuid, gym_status text, subscription_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
  v_subscription_status text;
  v_gym_status text;
begin
  if (select auth.uid()) is null or not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'Not authorized to manage gym workspaces';
  end if;
  if p_gym_id is null or p_status not in ('active', 'suspended') then
    raise exception using errcode = '22023', message = 'Gym status is invalid';
  end if;

  perform 1 from public.gyms where id = p_gym_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Gym not found';
  end if;

  select s.id, s.status into v_subscription_id, v_subscription_status
  from public.platform_subscriptions s
  where s.gym_id = p_gym_id
  order by s.starts_on desc, s.created_at desc, s.id desc
  limit 1
  for update;

  update public.gyms set status = p_status where id = p_gym_id returning status into v_gym_status;

  if p_status = 'suspended' and v_subscription_id is not null
    and v_subscription_status in ('trial', 'active', 'past_due') then
    update public.platform_subscriptions
    set status = 'suspended'
    where id = v_subscription_id
      and status = v_subscription_status
    returning status into v_subscription_status;
  end if;

  return query select p_gym_id, v_gym_status, v_subscription_status;
end;
$$;
revoke all on function public.set_platform_gym_status(uuid, text) from public, anon;
grant execute on function public.set_platform_gym_status(uuid, text) to authenticated;

commit;
