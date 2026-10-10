import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/202610080003_membership_payment_integrity.sql"),
  "utf8",
);
const phaseThree = readFileSync(
  path.join(root, "supabase/migrations/202610060001_phase3_membership_history.sql"),
  "utf8",
);

function functionSql(source: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`create(?: or replace)? function public\\.${escapedName}\\([\\s\\S]*?\\$\\$;`, "i"));
  if (!match) throw new Error(`Function definition not found: ${name}`);
  return match[0].toLowerCase();
}

describe("membership/payment migration SQL contract (static checks; not live DB tests)", () => {
  const paymentGuard = functionSql(migration, "guard_member_payment");
  const paymentRpc = functionSql(migration, "create_member_payment");
  const assignmentRpc = functionSql(migration, "assign_member_membership");
  const atomicRpc = functionSql(migration, "assign_membership_and_record_payment");
  const onboardingRpc = functionSql(migration, "create_gym_member_and_record_payment");
  const originalAssignment = functionSql(phaseThree, "assign_member_membership");

  it("rejects payment inserts for archived members at the trigger boundary", () => {
    expect(paymentGuard).toContain("m.status <> 'archived'");
    expect(paymentGuard).toContain("m.archived_at is null");
    expect(paymentGuard).toContain("for share");
  });

  it("rejects archived members through the existing payment RPC", () => {
    expect(paymentRpc).toContain("member_status = 'archived'");
    expect(paymentRpc).toContain("member_archived_at is not null");
    expect(paymentRpc).toContain("for update");
  });

  it("rejects archived members through membership assignment", () => {
    expect(assignmentRpc).toContain("m.status <> 'archived'");
    expect(assignmentRpc).toContain("m.archived_at is null");
  });

  it("derives exactly one gym from the authenticated gym-admin membership", () => {
    expect(atomicRpc).toContain("(select auth.uid())");
    expect(atomicRpc).toContain("m.role = 'gym_admin'");
    expect(atomicRpc).toContain("gym_count <> 1");
    expect(atomicRpc).not.toMatch(/p_(?:gym_id|amount|membership_id)\s/);
  });

  it("uses the existing assignment RPC for member, plan, tenant, and overlap validation", () => {
    expect(atomicRpc).toContain("public.assign_member_membership(");
    expect(originalAssignment).toContain("p.id = p_membership_plan_id and p.gym_id = target_gym_id and p.is_active");
    expect(originalAssignment).toContain("daterange(mm.start_date, mm.end_date, '[]')");
  });

  it("derives payment amount from the created membership price snapshot", () => {
    expect(atomicRpc).toContain("select mm.price_snapshot into target_amount");
    expect(atomicRpc).toContain("target_amount, target_currency");
    expect(atomicRpc).not.toMatch(/p_amount/);
  });

  it("links future-start payment to the newly created membership, not today's active membership", () => {
    expect(atomicRpc).toContain("p_start_date");
    expect(atomicRpc).toContain("created_membership_id, target_amount");
    expect(atomicRpc).not.toContain("mm.start_date <= gym_today");
  });

  it("validates payment date and method on the server and stores paid status as completed", () => {
    expect(atomicRpc).toContain("p_payment_date > gym_today");
    expect(atomicRpc).toContain("p_payment_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other')");
    expect(atomicRpc).toContain("'completed'");
  });

  it("keeps assignment and payment in one uncaught database function transaction", () => {
    expect(atomicRpc.indexOf("public.assign_member_membership(")).toBeLessThan(atomicRpc.indexOf("insert into public.member_payments"));
    expect(atomicRpc).not.toContain("exception when");
    expect(atomicRpc).not.toContain("commit;");
  });

  it("preserves existing membership history by expiring then appending, never deleting", () => {
    expect(assignmentRpc).toContain("update public.member_memberships mm set status = 'expired'");
    expect(assignmentRpc).toContain("insert into public.member_memberships(");
    expect(assignmentRpc).not.toContain("delete from public.member_memberships");
  });

  it("keeps the atomic RPC invoker-scoped with an empty search path and authenticated-only execute", () => {
    expect(atomicRpc).toContain("security invoker");
    expect(atomicRpc).toContain("set search_path = ''");
    expect(migration.toLowerCase()).toContain("grant execute on function public.assign_membership_and_record_payment(uuid, uuid, date, date, text, text, text) to authenticated");
    expect(migration.toLowerCase()).toContain("from public, anon, service_role");
  });

  it("retains the six-argument payment RPC and its authenticated/service-role grant", () => {
    expect(migration.toLowerCase()).toContain("create or replace function public.create_member_payment(");
    expect(migration.toLowerCase()).toContain("grant execute on function public.create_member_payment(uuid, numeric, text, date, text, text) to authenticated, service_role");
    expect(migration.toLowerCase()).not.toContain("drop function public.create_member_payment");
  });

  it("creates paid new-member enrollment through the existing member RPC and links its exact initial period", () => {
    expect(onboardingRpc).toContain("public.create_gym_member(");
    expect(onboardingRpc).toContain("mm.member_id = created_member_id");
    expect(onboardingRpc).toContain("mm.start_date = p_membership_start_date");
    expect(onboardingRpc).toContain("created_membership_id, target_amount");
    expect(onboardingRpc).not.toMatch(/p_(?:gym_id|amount|membership_id)\s/);
  });

  it("rolls back new member, membership, and payment together on a paid-enrollment error", () => {
    expect(onboardingRpc.indexOf("public.create_gym_member(")).toBeLessThan(onboardingRpc.indexOf("insert into public.member_payments"));
    expect(onboardingRpc).not.toContain("exception when");
    expect(onboardingRpc).not.toContain("commit;");
    expect(onboardingRpc).toContain("target_amount > 0");
  });
});
