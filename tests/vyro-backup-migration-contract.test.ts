import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(path.join(root, "supabase/migrations/202610080007_vyro_backup_restore.sql"), "utf8").toLowerCase();
const fn = migration.match(/create or replace function public\.restore_gym_operational_backup\([\s\S]*?\$\$;/)?.[0] ?? "";

describe("VYRO restore RPC contract (static application/database contract, not live data tests)", () => {
  it("derives the tenant from the authenticated gym-admin membership and rejects other gyms", () => {
    expect(fn).toContain("auth.uid()");
    expect(fn).toContain("gum.role = 'gym_admin'");
    expect(fn).toContain("gym_count <> 1");
    expect(fn).toContain("manifest,gym_id");
    expect(fn).toContain("target_gym_id::text");
    expect(fn).not.toContain("p_gym_id");
  });

  it("inserts all operational rows in one transaction and validates tenant references", () => {
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = ''");
    for (const table of ["membership_plans", "members", "member_memberships", "member_payments", "attendance_records", "trainers", "gym_expenses"]) {
      expect(fn).toContain(`insert into public.${table}`);
    }
    expect(fn).toContain("backup ids already exist");
    expect(fn).toContain("broken references");
    expect(fn).toContain("archived");
  });

  it("requires private photo objects to exist under canonical tenant paths and limits execution", () => {
    expect(fn).toContain("storage.objects");
    expect(fn).toContain("vyro-member-photos");
    expect(fn).toContain("vyro-gym-logos");
    expect(migration).toContain("grant execute on function public.restore_gym_operational_backup(jsonb) to authenticated");
    expect(migration).toContain("revoke all on function public.restore_gym_operational_backup(jsonb) from public, anon, service_role");
    expect(migration).not.toMatch(/alter table .* enable row level security|create policy|drop policy/);
  });
});
