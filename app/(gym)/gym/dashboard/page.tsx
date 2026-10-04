import { DashboardHeader, DataPanel, EmptyState, MetricGrid } from "@/components/dashboard";
import { formatDate, formatDateTime, formatCurrency, getGymDashboardData, type DashboardSummary } from "@/lib/dashboard-data";
import { requireRole } from "@/lib/auth/guards";
import { Alert, Badge } from "@/components/ui";

export default async function GymDashboardPage() {
  const identity = await requireRole("gym_admin");
  const data = await getGymDashboardData(identity.gymId!);
  const summary = data.summary as DashboardSummary | undefined;
  const gymName = data.gym?.name || "Your gym";
  return <>
    <DashboardHeader eyebrow={gymName} title="Your gym, at a glance" description="Today’s operations and the numbers that help you plan ahead." />
    {(data.summaryError || data.settingsError) && <Alert>Some dashboard data is unavailable. Please check the connection and try again.</Alert>}
    <MetricGrid metrics={[
      { label: "Total members", value: summary ? String(summary.total_members ?? 0) : "—", detail: "Members on record" },
      { label: "Active members", value: summary ? String(summary.active_members ?? 0) : "—", detail: "Currently active", tone: "good" },
      { label: "Expiring memberships", value: summary ? String(summary.expiring_members ?? 0) : "—", detail: "Expiring or expired", tone: "warning" },
      { label: "Today's check-ins", value: summary ? String(summary.today_attendance ?? 0) : "—", detail: "Recorded today", tone: "accent" },
      { label: "Monthly revenue", value: summary ? formatCurrency(summary.month_revenue, data.currency) : "—", detail: "Paid member transactions", tone: "accent" },
      { label: "Upcoming renewals", value: data.renewalsError ? "—" : String(data.upcomingRenewals ?? 0), detail: "Next 30 days", tone: "warning" },
    ]} />
    <div className="dashboard-columns">
      <DataPanel title="Upcoming renewals" description="Active memberships ending in the next 30 days.">
        {data.renewalsError ? <EmptyState title="Renewals unavailable" message="Renewal information could not be loaded right now." /> : data.renewals.length === 0 ? <EmptyState title="No upcoming renewals" message="Active memberships due in the next 30 days will appear here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>MEMBER</th><th>EXPIRES</th><th>STATUS</th></tr></thead><tbody>{data.renewals.map((member) => <tr key={member.id}><td className="table-primary">{member.full_name}</td><td>{formatDate(member.membership_expires_on)}</td><td><Badge tone="good">{member.status}</Badge></td></tr>)}</tbody></table></div>}
      </DataPanel>
      <DataPanel title="Today’s operations" description="A quick read on attendance and renewals.">
        <div className="status-strip"><div className="status-pill"><span />{summary ? `${summary.today_attendance ?? 0} check-ins today` : "Attendance unavailable"}</div><div className="status-pill"><span />{data.renewalsError ? "Renewal data unavailable" : `${data.upcomingRenewals ?? 0} renewals due soon`}</div></div>
      </DataPanel>
    </div>
    <div style={{ marginTop: 14 }}><DataPanel title="Recent activity" description="A short history of changes in your gym.">
      {data.activityError ? <EmptyState title="Activity unavailable" message="The activity log could not be loaded." /> : data.activities.length === 0 ? <EmptyState title="No activity yet" message="Member and payment changes will be recorded here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>EVENT</th><th>TYPE</th><th>WHEN</th></tr></thead><tbody>{data.activities.map((entry) => <tr key={entry.id}><td className="table-primary">{entry.action}</td><td>{entry.entity_type}</td><td>{formatDateTime(entry.created_at, data.timeZone)}</td></tr>)}</tbody></table></div>}
    </DataPanel></div>
  </>;
}
