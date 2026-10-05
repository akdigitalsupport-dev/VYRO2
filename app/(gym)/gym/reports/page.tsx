import { DashboardHeader, MetricGrid } from "@/components/dashboard";
import { getGymDashboardData, formatCurrency, type DashboardSummary } from "@/lib/dashboard-data";
import { requireRole } from "@/lib/auth/guards";

export default async function GymReportsPage() {
  const identity = await requireRole("gym_admin");
  const result = await getGymDashboardData(identity.gymId!);
  const summary = result.summary as DashboardSummary | undefined;
  return <><DashboardHeader eyebrow="Gym workspace" title="Reports" description="Live totals for members, attendance, memberships and revenue." />
    {result.summaryError && <p className="notice">Report totals are unavailable. Check the database migration and connection.</p>}
    <MetricGrid metrics={[
      { label: "Members", value: summary ? String(summary.total_members ?? 0) : "—", detail: "Non-archived records" },
      { label: "Active members", value: summary ? String(summary.active_members ?? 0) : "—", detail: "Current status", tone: "good" },
      { label: "Expiring memberships", value: summary ? String(summary.expiring_members ?? 0) : "—", detail: "Expiring or expired", tone: "warning" },
      { label: "Today's attendance", value: summary ? String(summary.today_attendance ?? 0) : "—", detail: "Recorded check-ins" },
      { label: "Member revenue · month", value: summary ? formatCurrency(summary.month_revenue, result.currency) : "—", detail: "Gym collections only", tone: "accent" },
    ]} />
    <section className="data-panel report-note"><div className="panel-heading"><div><h2>Report scope</h2><p>Payment totals include member → gym collections only.</p></div></div><div className="panel-body-copy">Attendance and member pages provide date, status and text filters. These totals are derived from tenant-scoped PostgreSQL queries; archived members remain excluded from current membership counts.</div></section>
  </>;
}
