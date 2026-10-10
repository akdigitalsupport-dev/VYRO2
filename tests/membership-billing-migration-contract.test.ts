import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(path.join(root, "supabase/migrations/202610080009_membership_billing_balances.sql"), "utf8").toLowerCase();

describe("membership billing migration contract (static SQL checks; not live transaction tests)", () => {
  it("derives billing from existing membership snapshots and payment rows without new balance storage", () => {
    expect(migration).toContain("mm.price_snapshot");
    expect(migration).toContain("sum(p.amount)");
    expect(migration).not.toContain("create table public.billing");
    expect(migration).not.toMatch(/add column\s+(?:billing_total|paid_total|outstanding)/);
  });

  it("keeps the two payment amounts separate and caps enrollment/renewal against the DB snapshot", () => {
    expect(migration).toContain("p_initial_payment_amount numeric");
    expect(migration).toContain("p_payment_amount numeric");
    expect(migration).toContain("payment_amount > target_price");
    expect(migration).toContain("payment_amount <> trunc(payment_amount, 2)");
  });

  it("locks membership balances and rejects payments above the current outstanding amount", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("greatest(membership_price - coalesce(paid_total, 0), 0)");
    expect(migration).toContain("payment_exceeds_outstanding:");
  });

  it("requires tenant-owned, non-archived member and membership records", () => {
    expect(migration).toContain("gum.user_id = (select auth.uid())");
    expect(migration).toContain("gum.role = 'gym_admin'");
    expect(migration).toContain("m.archived_at is null");
    expect(migration).toContain("mm.member_id = p_member_id");
    expect(migration).toContain("mm.gym_id = target_gym_id");
  });

  it("creates no zero-value payment row and preserves atomic transaction semantics", () => {
    expect(migration).toContain("if payment_amount > 0 then");
    expect(migration).toContain("create_gym_member_with_initial_payment");
    expect(migration).toContain("assign_membership_with_payment");
    expect(migration).toContain("begin;");
    expect(migration).toContain("commit;");
    expect(migration).not.toContain("exception when");
  });

  it("keeps invoker security, empty search paths, and authenticated-only new RPC execution", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("to authenticated;");
    expect(migration).toContain("from public, anon, service_role");
  });

  it("preserves old backup payment history in a trusted, narrowly scoped restore context", () => {
    expect(migration).toContain("vyro.trusted_backup_restore");
    expect(migration).toContain("pg_get_functiondef('public.restore_gym_operational_backup(jsonb)'::regprocedure)");
    expect(migration).toContain("restore function does not match the expected migration 007 body");
  });
});
