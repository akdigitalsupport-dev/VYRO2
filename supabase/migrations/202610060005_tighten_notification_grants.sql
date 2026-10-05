-- Supabase's default privileges are broad for new public tables. Keep access to
-- notification rows behind the policies and narrow grants defined in Phase 6.
revoke all on table public.notifications from public, anon, authenticated;
grant select, update (is_read, read_at) on table public.notifications to authenticated;

revoke all on table public.notification_preferences from public, anon, authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;
