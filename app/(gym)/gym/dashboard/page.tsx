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
      { label: "Expiring memberships", value: summary ? String(summary.expiring_members ?? 0) : "—", detail: "Due in the next 30 days", tone: "warning" },
      { label: "Expired memberships", value: summary ? String(summary.expired_members ?? 0) : "—", detail: "Latest terms past expiry", tone: "warning" },
      { label: "Today's attendance", value: summary ? String(summary.today_attendance ?? 0) : "—", detail: "Real check-ins recorded today", tone: "accent" },
      { label: "Today's revenue", value: summary ? formatCurrency(summary.today_revenue, data.currency) : "—", detail: "Completed member payments", tone: "good" },
      { label: "This month's revenue", value: summary ? formatCurrency(summary.month_revenue, data.currency) : "—", detail: "Completed member payments", tone: "accent" },
      { label: "Upcoming renewals", value: data.renewalsError ? "—" : String(data.upcomingRenewals ?? 0), detail: "Next 30 days", tone: "warning" },
    ]} />
    <div className="dashboard-columns">
      <DataPanel title="Upcoming renewals" description="Active memberships ending in the next 30 days.">
        {data.renewalsError ? <EmptyState title="Renewals unavailable" message="Renewal information could not be loaded right now." /> : data.renewals.length === 0 ? <EmptyState title="No upcoming renewals" message="Active memberships due in the next 30 days will appear here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>MEMBER</th><th>EXPIRES</th><th>STATUS</th></tr></thead><tbody>{data.renewals.map((member) => <tr key={member.id}><td className="table-primary">{member.full_name}</td><td>{formatDate(member.membership_expires_on)}</td><td><Badge tone="warning">Expiring soon</Badge></td></tr>)}</tbody></table></div>}
      </DataPanel>
      <DataPanel title="Today’s operations" description="A quick read on attendance and renewals.">
        <div className="status-strip"><div className="status-pill"><span />{summary ? `${summary.today_attendance ?? 0} check-ins today` : "Attendance unavailable"}</div><div className="status-pill"><span />{data.renewalsError ? "Renewal data unavailable" : `${data.upcomingRenewals ?? 0} renewals due soon`}</div></div>
      </DataPanel>
    </div>
    <div style={{ marginTop: 14 }}><DataPanel title="Recent activity" description="A short history of changes in your gym.">
      {data.activityError ? <EmptyState title="Activity unavailable" message="The activity log could not be loaded." /> : data.activities.length === 0 ? <EmptyState title="No activity yet" message="Member and payment changes will be recorded here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>EVENT</th><th>TYPE</th><th>WHEN</th></tr></thead><tbody>{data.activities.map((entry) => <tr key={entry.id}><td className="table-primary">{entry.action}</td><td>{entry.entity_type}</td><td>{formatDateTime(entry.created_at, data.timeZone)}</td></tr>)}</tbody></table></div>}
    </DataPanel></div>
    <div style={{ marginTop: 14 }}><DataPanel title="Recent member payments" description="Latest receipts recorded for this gym.">
      {data.paymentError ? <EmptyState title="Payments unavailable" message="Payment history could not be loaded right now." /> : data.recentPayments.length === 0 ? <EmptyState title="No member payments yet" message="Recorded member payments will appear here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>MEMBER</th><th>AMOUNT</th><th>DATE</th><th>STATUS</th></tr></thead><tbody>{data.recentPayments.map((payment) => <tr key={payment.id}><td className="table-primary">{payment.full_name}</td><td>{formatCurrency(payment.amount, payment.currency)}</td><td>{formatDateTime(payment.payment_date, data.timeZone)}</td><td><Badge tone={payment.status === "completed" ? "good" : payment.status === "pending" ? "warning" : "neutral"}>{payment.status}</Badge></td></tr>)}</tbody></table></div>}
    </DataPanel></div>
  </>;
}
