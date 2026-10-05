import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/dashboard-data";
import { resolveDateRange } from "@/lib/reporting";

type Params = { preset?: string; from?: string; to?: string };
type PlatformReport = {
  gyms: { total: number; active: number; expiring_subscriptions: number; expired_or_suspended: number };
  revenue: { completed: number | string };
  subscription_statuses: Array<{ status: string; count: number }>;
  renewal_activity: Array<{ date: string; count: number }>;
};
function Metric({ label, value }: { label: string; value: string | number }) { return <article className="report-kpi"><span>{label}</span><strong>{value}</strong></article>; }

export default async function PlatformReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [params, supabase] = await Promise.all([searchParams, createSupabaseServerClient()]);
  const { data: settings } = await supabase.from("platform_settings").select("default_currency, default_timezone").eq("id", 1).maybeSingle();
  const range = resolveDateRange(params.preset, params.from, params.to, settings?.default_timezone || "Asia/Kolkata");
  const { data: reportData, error } = range.error ? { data: null, error: { message: range.error } } : await supabase.rpc("get_platform_report", { p_from: range.from, p_to: range.to });
  const report = reportData as unknown as PlatformReport | null;
  const currency = settings?.default_currency || "INR";
  return <><DashboardHeader eyebrow="Platform intelligence" title="Reports" description="Aggregated gym status and VYRO subscription results. Gym member revenue remains separate." />
    <form className="report-controls" method="get"><label>Date range<select name="preset" defaultValue={params.preset || "last_30_days"}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last_7_days">Last 7 days</option><option value="last_30_days">Last 30 days</option><option value="current_month">Current month</option><option value="previous_month">Previous month</option><option value="custom">Custom</option></select></label><label>From<input name="from" type="date" defaultValue={params.from || range.from} /></label><label>To<input name="to" type="date" defaultValue={params.to || range.to} /></label><button className="button button-primary" type="submit">Run report</button><span className="panel-body-copy">{range.from} to {range.to}</span></form>
    {range.error && <p className="form-error" role="alert">{range.error}</p>}
    {error && <p className="notice" role="alert">Report data could not be loaded. Check the database connection and access.</p>}
    {report && <>
      <DataPanel title="Platform overview" description="Current organization status and VYRO subscription revenue for the selected dates."><div className="report-kpis"><Metric label="Total gyms" value={report.gyms.total} /><Metric label="Active gyms" value={report.gyms.active} /><Metric label="Expiring subscriptions" value={report.gyms.expiring_subscriptions} /><Metric label="Expired or suspended gyms" value={report.gyms.expired_or_suspended} /><Metric label="VYRO completed revenue" value={formatCurrency(report.revenue.completed, currency)} /></div></DataPanel>
      <div className="report-section"><DataPanel title="VYRO subscription status" description="Platform subscriptions only; gym-member plans are not included."><div className="table-wrap report-table"><table className="data-table"><thead><tr><th>SUBSCRIPTION STATUS</th><th>COUNT</th></tr></thead><tbody>{report.subscription_statuses.map((row) => <tr key={row.status}><td className="table-primary">{row.status.replaceAll("_", " ")}</td><td>{row.count}</td></tr>)}{report.subscription_statuses.length === 0 && <tr><td colSpan={2}>No subscriptions recorded.</td></tr>}</tbody></table></div></DataPanel></div>
      <div className="report-section"><DataPanel title="Renewal activity" description={`Subscription renewal dates from ${formatDate(range.from)} to ${formatDate(range.to)}.`}><div className="table-wrap report-table"><table className="data-table"><thead><tr><th>RENEWAL DATE</th><th>SUBSCRIPTIONS</th></tr></thead><tbody>{report.renewal_activity.map((row) => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{row.count}</td></tr>)}{report.renewal_activity.length === 0 && <tr><td colSpan={2}>No renewal dates in this period.</td></tr>}</tbody></table></div></DataPanel></div>
    </>}
  </>;
}
