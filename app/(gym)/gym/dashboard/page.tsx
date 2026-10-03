import { DashboardHeader, DataPanel, EmptyState, MetricGrid } from "@/components/dashboard";
import { formatDate, formatDateTime, formatCurrency, getGymDashboardData, type DashboardSummary } from "@/lib/dashboard-data";
import { requireRole } from "@/lib/auth/guards";

export default async function GymDashboardPage() {
  const identity = await requireRole("gym_admin");
  const data = await getGymDashboardData(identity.gymId!);
  const summary = data.summary as DashboardSummary | undefined;
  const gymName = data.gym?.name || "Your gym";
  return <>
    <DashboardHeader eyebrow={gymName} title="Your gym, at a glance" description="Today’s operations and the numbers that help you plan ahead." />
    {data.summaryError && <p className="notice" role="status">Dashboard metrics are unavailable. Check the database migration and connection settings.</p>}
    <MetricGrid metrics={[
      { label: "Total members", value: summary ? String(summary.total_members ?? 0) : "—", detail: "Members on record" },
      { label: "Active members", value: summary ? String(summary.active_members ?? 0) : "—", detail: "Currently active", tone: "good" },
      { label: "Memberships to review", value: summary ? String(summary.expiring_members ?? 0) : "—", detail: "Expiring or expired", tone: "warning" },
      { label: "Today's check-ins", value: summary ? String(summary.today_attendance ?? 0) : "—", detail: "Recorded today", tone: "accent" },
    ]} />
    <div className="dashboard-columns">
      <DataPanel title="Memberships to review" description="Members with an expiring or expired plan.">
        {data.renewalsError ? <EmptyState title="Memberships unavailable" message="Renewal information could not be loaded." /> : data.renewals.length === 0 ? <EmptyState title="All caught up" message="Members needing membership follow-up will appear here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>MEMBER</th><th>EXPIRES</th><th>STATUS</th></tr></thead><tbody>{data.renewals.map((member) => <tr key={member.id}><td className="table-primary">{member.full_name}</td><td>{formatDate(member.membership_expires_on)}</td><td><span className={`status-badge ${member.status}`}>{member.status}</span></td></tr>)}</tbody></table></div>}
      </DataPanel>
      <DataPanel title="This month" description="Member payments recorded this month.">
        <div className="empty-state" style={{ minHeight: 125 }}><strong style={{ fontSize: 28 }}>{summary ? formatCurrency(summary.month_revenue, data.currency) : "—"}</strong><p>Paid gym member transactions</p></div>
      </DataPanel>
    </div>
    <div style={{ marginTop: 14 }}><DataPanel title="Recent activity" description="A short history of changes in your gym.">
      {data.activityError ? <EmptyState title="Activity unavailable" message="The activity log could not be loaded." /> : data.activities.length === 0 ? <EmptyState title="No activity yet" message="Member and payment changes will be recorded here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>EVENT</th><th>TYPE</th><th>WHEN</th></tr></thead><tbody>{data.activities.map((entry) => <tr key={entry.id}><td className="table-primary">{entry.action}</td><td>{entry.entity_type}</td><td>{formatDateTime(entry.created_at, data.timeZone)}</td></tr>)}</tbody></table></div>}
    </DataPanel></div>
  </>;
}
