begin;

-- Keep the existing tenant INSERT policy and add an ANDed identity constraint.
-- A Gym Admin may only create a lead attributed to the authenticated user.
create policy "gym leads creator matches authenticated identity"
  on public.gym_leads
  as restrictive
  for insert to authenticated
  with check (created_by is not distinct from (select auth.uid()));

-- PostgreSQL table-level UPDATE privileges override column-level restrictions.
-- Remove those grants, then expose only fields used by legitimate lead edits.
-- The updated_at trigger can continue assigning updated_at without client UPDATE
-- permission on that column.
revoke update on public.gym_leads from public, anon, authenticated;
grant update (name, phone, email, source, notes, status)
  on public.gym_leads to authenticated;

commit;
