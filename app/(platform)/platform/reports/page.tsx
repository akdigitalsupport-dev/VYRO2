import { DashboardHeader, MetricGrid } from "@/components/dashboard";
import { getPlatformDashboardData, type DashboardSummary, formatCurrency } from "@/lib/dashboard-data";

export default async function PlatformReportsPage() {
  const { summary, summaryError, currency } = await getPlatformDashboardData();
  const data = summary as DashboardSummary | undefined;
  return <><DashboardHeader eyebrow="Platform intelligence" title="Reports" description="Current platform totals from the live database." />
    {summaryError && <p className="notice">Report totals are unavailable. Check the database connection and migration.</p>}
    <MetricGrid metrics={[
      { label: "Gyms", value: data ? String(data.total_gyms ?? 0) : "—", detail: "All organizations" },
      { label: "Active members", value: data ? String(data.active_members ?? 0) : "—", detail: "Current membership status" },
      { label: "VYRO revenue this month", value: data ? formatCurrency(data.month_revenue, currency) : "—", detail: "Platform billing only", tone: "accent" },
      { label: "Upcoming renewals", value: data ? String(data.upcoming_renewals ?? 0) : "—", detail: "Next 30 days", tone: "warning" },
    ]} />
    <section className="data-panel report-note"><div className="panel-heading"><div><h2>Reporting scope</h2><p>VYRO billing is distinct from payments collected by gyms from their members.</p></div></div><div className="panel-body-copy">Detailed growth and attendance exports will be added alongside their filtered report views. These totals are computed in PostgreSQL and respect the platform-owner database policy.</div></section>
  </>;
}
