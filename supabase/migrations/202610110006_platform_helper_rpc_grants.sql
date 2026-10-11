begin;

-- Migration 003 revokes the PUBLIC pseudo-role grant on has_gym_access(), but
-- the existing production function also has a separate explicit anon grant.
-- Remove anonymous RPC execution without breaking authenticated RLS policies.
revoke all on function public.has_gym_access(uuid) from public, anon;
grant execute on function public.has_gym_access(uuid) to authenticated;

-- These helpers are used by authenticated policy checks/admin actions, not by
-- unauthenticated callers. Keep authenticated access where the app relies on it.
revoke all on function public.is_platform_owner() from public, anon;
grant execute on function public.is_platform_owner() to authenticated;

revoke all on function public.provision_gym_admin(uuid, uuid) from public, anon;
grant execute on function public.provision_gym_admin(uuid, uuid) to authenticated;

-- Trigger-only function: it should not be callable as an exposed RPC.
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

commit;
