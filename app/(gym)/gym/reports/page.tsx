import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/dashboard-data";
import { resolveDateRange } from "@/lib/reporting";
import { AuditLogViewer } from "@/components/audit-log-viewer";

type Params = { preset?: string; from?: string; to?: string; audit_event?: string; audit_actor?: string; audit_from?: string; audit_to?: string; audit_page?: string };
type GymReport = {
  members: { total: number; active: number; inactive: number; archived: number; new_in_period: number };
  memberships: { active: number; expiring: number; expired: number; renewals_in_period: number; by_plan: Array<{ plan: string; members: number; status: string }> };
  attendance: { total_check_ins: number; unique_members: number; by_day: Array<{ date: string; check_ins: number; unique_members: number }> };
  payments: { completed_revenue: number | string; pending_count: number; failed_count: number; refunded_count: number; by_method: Array<{ method: string; count: number; completed_revenue: number | string }>; revenue_by_day: Array<{ date: string; amount: number | string }> };
};

function Metric({ label, value }: { label: string; value: string | number }) { return <article className="report-kpi"><span>{label}</span><strong>{value}</strong></article>; }

export default async function GymReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [identity, params] = await Promise.all([requireRole("gym_admin"), searchParams]);
  const supabase = await createSupabaseServerClient();
  const { data: settings } = await supabase.from("gym_settings").select("currency, timezone").eq("gym_id", identity.gymId!).maybeSingle();
  const range = resolveDateRange(params.preset, params.from, params.to, settings?.timezone || "Asia/Kolkata");
  const { data: reportData, error: reportError } = range.error ? { data: null, error: { message: range.error } } : await supabase.rpc("get_gym_report", { target_gym_id: identity.gymId!, p_from: range.from, p_to: range.to });
  const report = reportData as unknown as GymReport | null;
  const currency = settings?.currency || "INR";
  return <><DashboardHeader eyebrow="Gym workspace" title="Reports" description="Member, membership, attendance, and payment summaries for this gym." />
    <form className="report-controls" method="get"><label>Date range<select name="preset" defaultValue={params.preset || "last_30_days"}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last_7_days">Last 7 days</option><option value="last_30_days">Last 30 days</option><option value="current_month">Current month</option><option value="previous_month">Previous month</option><option value="custom">Custom</option></select></label><label>From<input name="from" type="date" defaultValue={params.from || range.from} /></label><label>To<input name="to" type="date" defaultValue={params.to || range.to} /></label><button className="button button-primary" type="submit">Run report</button><span className="panel-body-copy">{range.from} to {range.to}</span></form>
    {range.error && <p className="form-error" role="alert">{range.error}</p>}
    {reportError && <p className="notice" role="alert">Report data could not be loaded. Check access and database configuration.</p>}
    {report && <>
      <DataPanel title="Member overview" description={`Current membership state and new members from ${formatDate(range.from)} to ${formatDate(range.to)}.`}><div className="report-kpis"><Metric label="Total members" value={report.members.total} /><Metric label="Active members" value={report.members.active} /><Metric label="Inactive members" value={report.members.inactive} /><Metric label="Archived members" value={report.members.archived} /><Metric label="New in period" value={report.members.new_in_period} /></div></DataPanel>
      <div className="report-section"><DataPanel title="Membership health" description="Current membership history status and renewals recorded in the selected period."><div className="report-kpis"><Metric label="Active memberships" value={report.memberships.active} /><Metric label="Expiring in 30 days" value={report.memberships.expiring} /><Metric label="Expired memberships" value={report.memberships.expired} /><Metric label="Renewals in period" value={report.memberships.renewals_in_period} /></div><div className="table-wrap report-table"><table className="data-table"><thead><tr><th>PLAN</th><th>MEMBERS</th><th>STATUS</th></tr></thead><tbody>{report.memberships.by_plan.map((row, i) => <tr key={`${row.plan}-${row.status}-${i}`}><td className="table-primary">{row.plan}</td><td>{row.members}</td><td><span className={`status-badge ${row.status}`}>{row.status}</span></td></tr>)}</tbody></table></div></DataPanel></div>
      <div className="report-section"><DataPanel title="Attendance" description={`Aggregated check-ins from ${formatDate(range.from)} to ${formatDate(range.to)}.`}><div className="report-kpis"><Metric label="Total check-ins" value={report.attendance.total_check_ins} /><Metric label="Unique members" value={report.attendance.unique_members} /></div><div className="table-wrap report-table"><table className="data-table"><thead><tr><th>DATE</th><th>CHECK-INS</th><th>UNIQUE MEMBERS</th></tr></thead><tbody>{report.attendance.by_day.map((row) => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{row.check_ins}</td><td>{row.unique_members}</td></tr>)}{report.attendance.by_day.length === 0 && <tr><td colSpan={3}>No check-ins in this period.</td></tr>}</tbody></table></div></DataPanel></div>
      <div className="report-section"><DataPanel title="Member payments and revenue" description="Only completed member payments count as revenue. VYRO subscription billing is separate."><div className="report-kpis"><Metric label="Completed revenue" value={formatCurrency(report.payments.completed_revenue, currency)} /><Metric label="Pending payments" value={report.payments.pending_count} /><Metric label="Failed payments" value={report.payments.failed_count} /><Metric label="Refunded payments" value={report.payments.refunded_count} /></div><div className="dashboard-columns"><div className="table-wrap report-table"><table className="data-table"><thead><tr><th>REVENUE DATE</th><th>COMPLETED AMOUNT</th></tr></thead><tbody>{report.payments.revenue_by_day.map((row) => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{formatCurrency(row.amount, currency)}</td></tr>)}{report.payments.revenue_by_day.length === 0 && <tr><td colSpan={2}>No completed revenue in this period.</td></tr>}</tbody></table></div><div className="table-wrap report-table"><table className="data-table"><thead><tr><th>METHOD</th><th>PAYMENTS</th><th>REVENUE</th></tr></thead><tbody>{report.payments.by_method.map((row) => <tr key={row.method}><td>{row.method.replaceAll("_", " ")}</td><td>{row.count}</td><td>{formatCurrency(row.completed_revenue, currency)}</td></tr>)}{report.payments.by_method.length === 0 && <tr><td colSpan={3}>No payments in this period.</td></tr>}</tbody></table></div></div></DataPanel></div>
    </>}
    <div className="report-section"><AuditLogViewer scope="gym" searchParams={searchParams} /></div>
  </>;
}
