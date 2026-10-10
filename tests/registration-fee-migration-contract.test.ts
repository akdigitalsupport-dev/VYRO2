import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(path.join(root, "supabase/migrations/202610090001_first_time_registration_fee.sql"), "utf8").toLowerCase();
const optionalMigration = readFileSync(path.join(root, "supabase/migrations/202610090002_optional_registration_fee_and_web_push.sql"), "utf8").toLowerCase();

describe("registration fee migration contract (static SQL checks; not live database tests)", () => {
  it("defaults each gym to ₹199 and stores configurable enabled state", () => {
    expect(migration).toContain("registration_fee_amount numeric(12,2) not null default 199.00");
    expect(migration).toContain("registration_fee_enabled boolean not null default true");
    expect(migration).toContain("update_gym_registration_settings");
  });

  it("stores registration receipts as independent, immutable amount snapshots", () => {
    expect(migration).toContain("create table public.member_registration_payments");
    expect(migration).toContain("amount numeric(12,2) not null check (amount > 0)");
    expect(migration).toContain("payment_date date not null");
    expect(migration).toContain("payment_method text not null");
    expect(migration).toContain("status text not null default 'completed'");
    expect(migration).toContain("unique (gym_id, member_id)");
    expect(migration).not.toContain("member_payments set");
  });

  it("enforces tenant ownership, read-only browser access, and duplicate prevention", () => {
    expect(migration).toContain("foreign key (member_id, gym_id) references public.members(id, gym_id)");
    expect(migration).toContain("using (public.has_gym_access(gym_id))");
    expect(migration).toContain("grant select on table public.member_registration_payments to authenticated");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("where gum.user_id = (select auth.uid()) and gum.role = 'gym_admin'");
    expect(migration).toContain("gym_count <> 1");
    expect(migration).toContain("registration payment already exists for this member");
  });

  it("creates registration in the same transaction as initial enrollment and payment", () => {
    const wrapperStart = migration.indexOf("create function public.create_gym_member_with_registration");
    const wrapperEnd = migration.indexOf("$$;", wrapperStart) + 3;
    const wrapper = migration.slice(wrapperStart, wrapperEnd);
    expect(wrapper).toContain("public.create_gym_member_with_initial_payment(");
    expect(wrapper.indexOf("public.create_gym_member_with_initial_payment(")).toBeLessThan(wrapper.indexOf("insert into public.member_registration_payments"));
    expect(wrapper).toContain("p_registration_payment_date > gym_today");
    expect(wrapper).toContain("target_fee");
    expect(wrapper).not.toMatch(/p_registration_(?:amount|gym_id|fee)/);
    expect(migration).toContain("revoke all on function public.create_gym_member_with_initial_payment");
    expect(migration).toContain("revoke all on function public.create_gym_member(");
    expect(migration).toContain("begin;");
    expect(migration).toContain("commit;");
  });

  it("counts completed registration and membership receipts separately in collected revenue", () => {
    expect(migration).toContain("public.get_gym_revenue_breakdown(p_from date, p_to date)");
    expect(migration).toContain("from public.member_payments mp");
    expect(migration).toContain("from public.member_registration_payments rp");
    expect(migration).toContain("mp.status = 'completed'");
    expect(migration).toContain("rp.status = 'completed'");
    expect(migration).toContain("'membership_revenue'");
    expect(migration).toContain("'registration_revenue'");
    expect(migration).toContain("'total_revenue'");
  });

  it("allows an opt-out only through the server-side enrollment choice while keeping the fee amount server-derived", () => {
    expect(optionalMigration).toContain("p_charge_registration boolean");
    expect(optionalMigration).toContain("charge_fee := fee_enabled and p_charge_registration");
    expect(optionalMigration).toContain("if charge_fee then");
    expect(optionalMigration).toContain("target_fee");
    expect(optionalMigration).not.toMatch(/p_registration_(?:amount|fee|gym_id)\s/);
    expect(optionalMigration).toContain("revoke all on function public.create_gym_member_with_registration");
  });
});
