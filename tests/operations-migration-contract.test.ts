import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const operations = readFileSync(path.join(root, "supabase/migrations/202610080004_operations_suite.sql"), "utf8").toLowerCase();
const freeRenewal = readFileSync(path.join(root, "supabase/migrations/202610080005_atomic_free_membership_renewal.sql"), "utf8").toLowerCase();
const archiveDirectory = readFileSync(path.join(root, "supabase/migrations/202610080006_member_archive_directory_integrity.sql"), "utf8").toLowerCase();
function fn(source: string, name: string) { const found = source.match(new RegExp(`create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i")); if (!found) throw new Error(`Missing ${name}`); return found[0]; }
describe("operations and free-renewal migration contract (static checks; not live database tests)", () => {
 it("adds tenant-scoped trainers and expenses with RLS and no authenticated delete grant", () => {
  expect(operations).toContain("create table public.trainers"); expect(operations).toContain("create table public.gym_expenses");
  expect(operations).toContain("alter table public.trainers enable row level security"); expect(operations).toContain("alter table public.gym_expenses enable row level security");
  expect(operations).toContain("public.has_gym_access(gym_id)"); expect(operations).toContain("grant select, insert, update on public.gym_expenses to authenticated");
  expect(operations).not.toMatch(/grant[^;]*delete[^;]*on public\\.(trainers|gym_expenses)/);
 });
 it("limits uploaded gym logos to private JPEG/PNG files and canonical current-gym paths", () => {
  expect(operations).toContain("'vyro-gym-logos', 'vyro-gym-logos', false, 2097152");
  expect(operations.match(/create policy "vyro gym logos (select|insert|update|delete)"/g)).toHaveLength(4);
  expect(operations).toContain("public.storage_path_gym_id(name)"); expect(operations).toContain("[1-8][0-9a-f]{3}");
 });
 it("derives settings and reporting gym from authenticated membership, not browser tenant parameters", () => {
  const settings = fn(operations, "update_gym_profile"); const expenses = fn(operations, "get_gym_expense_report");
  expect(settings).toContain("gum.user_id = caller_id"); expect(settings).toContain("gym_count <> 1"); expect(settings).not.toContain("p_gym_id");
  expect(expenses).toContain("gum.user_id = (select auth.uid())"); expect(expenses).toContain("gym_count <> 1");
  expect(settings).toContain("security definer"); expect(settings).toContain("set search_path = ''");
 });
 it("deletes only archived tenant members and explicitly removes dependent records", () => {
  const deletion = fn(operations, "permanently_delete_archived_member");
  expect(deletion).toContain("m.gym_id = target_gym_id"); expect(deletion).toContain("m.status = 'archived' or m.archived_at is not null");
  expect(deletion).toContain("delete from public.member_payments"); expect(deletion).toContain("delete from public.attendance_records"); expect(deletion).toContain("delete from public.member_memberships");
  expect(deletion).toContain("delete from public.members"); expect(deletion).toContain("member.permanently_deleted");
 });
 it("keeps free membership renewal transactional and skips only the zero-value payment", () => {
  const renewal = fn(freeRenewal, "assign_membership_and_record_payment");
  expect(renewal).toContain("security invoker"); expect(renewal).toContain("set search_path = ''");
  expect(renewal).toContain("public.assign_member_membership"); expect(renewal).toContain("if target_amount > 0 then");
  expect(renewal).toContain("'completed'"); expect(renewal).not.toContain("p_gym_id"); expect(renewal).not.toContain("exception when");
 });
 it("excludes archived_at rows from normal operational lists and exposes them in the archived view", () => {
  const directory = fn(archiveDirectory, "get_gym_member_directory");
  expect(directory).toContain("m.archived_at is null");
  expect(directory).toContain("m.status = 'archived' or m.archived_at is not null");
  expect(directory).toContain("security invoker"); expect(directory).toContain("set search_path = ''");
 });
});
