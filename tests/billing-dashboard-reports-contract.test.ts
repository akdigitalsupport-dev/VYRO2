import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const operations = readFileSync(path.join(root, "supabase/migrations/202610080004_operations_suite.sql"), "utf8").toLowerCase();
const metrics = readFileSync(path.join(root, "supabase/migrations/202610080008_exclude_archived_from_operational_metrics.sql"), "utf8").toLowerCase();
const dashboard = readFileSync(path.join(root, "app/(gym)/gym/command-center/page.tsx"), "utf8");
const reports = readFileSync(path.join(root, "app/(gym)/gym/reports/page.tsx"), "utf8");

function functionSql(source: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = source.match(new RegExp(`create(?: or replace)? function public\\.${escapedName}\\([\\s\\S]*?\\$\\$;`, "i"));
  if (!found) throw new Error(`Missing ${name}`);
  return found[0];
}

describe("dashboard and report billing contracts (static SQL checks; not live DB tests)", () => {
  it("counts only completed payment amounts as collected dashboard revenue", () => {
    const summary = functionSql(operations, "get_gym_financial_snapshot");
    expect(summary).toContain("sum(p.amount)");
    expect(summary).toContain("p.status = 'completed'");
    expect(dashboard).toContain('label="Collected this month"');
    expect(dashboard).toContain('label="Outstanding"');
    expect(dashboard).toContain('label="Expected"');
  });

  it("derives expected and due values from the membership price snapshot and its linked completed payments", () => {
    const summary = functionSql(operations, "get_gym_financial_snapshot");
    expect(summary).toContain("mm.price_snapshot");
    expect(summary).toContain("p.membership_id is not null");
    expect(summary).toContain("greatest(cm.price_snapshot - coalesce(mp.amount, 0), 0)");
  });

  it("sums actual completed member payment transactions for report revenue", () => {
    const report = functionSql(metrics, "get_gym_report");
    expect(report).toContain("daily_revenue");
    expect(report).toContain("sum(p.amount)");
    expect(report).toContain("p.status = 'completed'");
    expect(reports).toContain("get_gym_revenue_breakdown");
    expect(reports).toContain("membership_revenue");
    expect(reports).toContain("registration_revenue");
    expect(reports).toContain("revenue - expenses");
  });

  it("keeps payment and report queries gym-scoped with the existing authorization guards", () => {
    const report = functionSql(metrics, "get_gym_report");
    const summary = functionSql(operations, "get_gym_financial_snapshot");
    expect(report).toContain("gum.user_id = (select auth.uid())");
    expect(report).toContain("gum.gym_id = target_gym_id");
    expect(summary).toContain("gum.user_id = (select auth.uid())");
    expect(summary).toContain("gym_count <> 1");
  });
});
