import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(path.join(root, "supabase/migrations/202610080008_exclude_archived_from_operational_metrics.sql"), "utf8").toLowerCase();

describe("archived member operational metrics migration", () => {
  it("excludes archived members from dashboard membership and check-in counts", () => {
    const dashboard = sql.slice(sql.indexOf("create or replace function public.get_gym_dashboard_summary"), sql.indexOf("create or replace function public.get_gym_report"));
    expect(dashboard).toContain("m.status <> 'archived'");
    expect(dashboard).toContain("m.archived_at is null");
    expect(dashboard).toContain("join public.members m on m.id = a.member_id and m.gym_id = a.gym_id");
    expect(dashboard).toContain("security invoker");
  });

  it("excludes archived member records from reports and retains collected financial history", () => {
    const reports = sql.slice(sql.indexOf("create or replace function public.get_gym_report"));
    expect(reports).toContain("m.status <> 'archived'");
    expect(reports).toContain("m.archived_at is null");
    expect(reports).toContain("p.status = 'completed'");
    expect(reports).not.toMatch(/alter table|create policy|drop policy|delete from/);
    expect(sql).toContain("grant execute on function public.get_gym_report(uuid, date, date) to authenticated");
  });
});
