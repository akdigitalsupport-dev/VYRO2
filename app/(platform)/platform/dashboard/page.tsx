import { DashboardHeader, DataPanel, EmptyState, MetricGrid } from "@/components/dashboard";
import { formatDate, formatDateTime, formatCurrency, getPlatformDashboardData, type DashboardSummary } from "@/lib/dashboard-data";

export default async function PlatformDashboardPage() {
  const data = await getPlatformDashboardData();
  const summary = data.summary as DashboardSummary | undefined;
  return <>
    <DashboardHeader eyebrow="Platform overview" title="VYRO at a glance" description="A clear view of how the platform is running today." />
    {data.summaryError && <p className="notice" role="status">Platform metrics are unavailable. Check the database migration and connection settings.</p>}
    <MetricGrid metrics={[
      { label: "Total gyms", value: summary ? String(summary.total_gyms ?? 0) : "—", detail: "Across the platform", tone: "accent" },
      { label: "Active gyms", value: summary ? String(summary.active_gyms ?? 0) : "—", detail: "Currently operating", tone: "good" },
      { label: "Expiring gyms", value: summary ? String(summary.expiring_gyms ?? 0) : "—", detail: "Renewal due in 30 days", tone: "warning" },
      { label: "Expired or suspended", value: summary ? String(summary.inactive_gyms ?? 0) : "—", detail: "Need platform attention" },
      { label: "Active members", value: summary ? String(summary.active_members ?? 0) : "—", detail: "Across active gyms", tone: "good" },
      { label: "VYRO revenue · month", value: summary ? formatCurrency(summary.month_revenue, data.currency) : "—", detail: "Platform subscription payments", tone: "accent" },
      { label: "Upcoming renewals", value: summary ? String(summary.upcoming_renewals ?? 0) : "—", detail: "Next 30 days", tone: "warning" },
    ]} />
    <div className="dashboard-columns">
      <DataPanel title="Renewal overview" description="The next subscriptions requiring attention.">
        {data.renewalsError ? <EmptyState title="Renewals unavailable" message="Renewal information could not be loaded right now." /> : data.renewals.length === 0 ? <EmptyState title="No upcoming renewals" message="Subscriptions due in the next 30 days will appear here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>GYM</th><th>PLAN</th><th>RENEWAL</th><th>STATUS</th></tr></thead><tbody>{data.renewals.map((item) => { const gym = item.gyms as unknown as { name?: string } | null; return <tr key={item.id}><td className="table-primary">{gym?.name || "Gym"}</td><td>{item.plan_name}</td><td>{formatDate(item.expires_on)}</td><td><span className="status-badge">{item.status}</span></td></tr>; })}</tbody></table></div>}
      </DataPanel>
      <DataPanel title="Platform health" description="Operational signals from the connected workspace.">
        <div className="status-strip"><div className="status-pill"><span />Database {data.summaryError ? "needs attention" : "connected"}</div><div className="status-pill"><span />Authentication enabled</div><div className="status-pill muted"><span />Background jobs not configured</div></div>
        <div className="panel-heading"><div><h2>Revenue definition</h2><p>Includes gym subscription payments to VYRO only.</p></div></div>
      </DataPanel>
    </div>
    <div style={{ marginTop: 14 }}><DataPanel title="Recent activity" description="A short audit trail of platform changes.">
      {data.activityError ? <EmptyState title="Activity unavailable" message="The audit log could not be loaded." /> : data.activities.length === 0 ? <EmptyState title="No platform activity yet" message="Important platform changes will be recorded here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>EVENT</th><th>TYPE</th><th>WHEN</th></tr></thead><tbody>{data.activities.map((entry) => <tr key={entry.id}><td className="table-primary">{entry.action}</td><td>{entry.entity_type}</td><td>{formatDateTime(entry.created_at, data.timeZone)}</td></tr>)}</tbody></table></div>}
    </DataPanel></div>
  </>;
}
