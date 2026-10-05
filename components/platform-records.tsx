import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/dashboard";
import { ServerTable } from "@/components/server-table";
import { formatDate, formatDateTime } from "@/lib/dashboard-data";
import { updatePlatformPaymentStatus } from "@/lib/platform/actions";

type View = "subscriptions" | "renewals" | "revenue";

export async function PlatformRecords({ view }: { view: View }) {
  const supabase = await createSupabaseServerClient();
  if (view === "revenue") {
    const [{ data, error }, { data: summary }] = await Promise.all([
      supabase.from("platform_subscription_payments")
        .select("id, amount, currency, payment_date, reference, status, gyms(name)")
        .order("payment_date", { ascending: false }).limit(100),
      supabase.rpc("get_platform_dashboard_summary"),
    ]);
    return <><DashboardHeader eyebrow="Platform billing" title="Revenue" description="Payments from gyms to VYRO. Gym member payments are kept in a separate ledger." />
      <div className="metric-grid"><article className="metric-card"><span>Completed revenue this month</span><strong>{new Intl.NumberFormat("en-IN", { style: "currency", currency: data?.[0]?.currency || "INR" }).format(Number(summary?.[0]?.month_revenue || 0))}</strong></article></div>
      {error ? <div className="notice">Platform billing data could not be loaded.</div> : <ServerTable rows={data || []} emptyTitle="No platform payments yet" emptyMessage="VYRO subscription payments will appear here when recorded." columns={[
        { label: "GYM", className: "table-primary", render: (row) => (row.gyms as unknown as { name?: string } | null)?.name || "Gym" },
        { label: "AMOUNT", render: (row) => new Intl.NumberFormat("en-IN", { style: "currency", currency: row.currency }).format(Number(row.amount)) },
        { label: "PAYMENT DATE", render: (row) => formatDateTime(row.payment_date) },
        { label: "REFERENCE", render: (row) => row.reference || "—" },
        { label: "STATUS", render: (row) => <span className={`status-badge ${row.status}`}>{row.status}</span> },
        { label: "ACTIONS", render: (row) => row.status === "pending" || row.status === "completed" ? <form action={updatePlatformPaymentStatus} className="inline-form"><input type="hidden" name="payment_id" value={row.id} /><select name="status" defaultValue="" aria-label={`Update payment ${row.id} status`}><option value="" disabled>Set status</option>{row.status === "pending" ? <><option value="completed">Complete</option><option value="failed">Failed</option><option value="cancelled">Cancel</option></> : <option value="refunded">Refund</option>}</select><button className="button" type="submit">Save</button></form> : "—" },
      ]} />}</>;
  }
  const isRenewal = view === "renewals";
  let request = supabase.from("platform_subscriptions")
    .select("id, gym_id, plan_name, amount, currency, billing_period, starts_on, expires_on, status, gyms(name)")
    .order(isRenewal ? "expires_on" : "created_at", { ascending: true }).limit(100);
  if (isRenewal) request = request.in("status", ["active", "trial", "past_due"]).gte("expires_on", new Date().toISOString().slice(0, 10));
  const { data, error } = await request;
  return <><DashboardHeader eyebrow="Platform billing" title={isRenewal ? "Upcoming renewals" : "Subscriptions"} description={isRenewal ? "Active VYRO subscriptions ordered by renewal date." : "Plans and terms for each gym’s VYRO subscription."} />
    {error ? <div className="notice">Subscription data could not be loaded.</div> : <ServerTable rows={data || []} emptyTitle={isRenewal ? "No upcoming renewals" : "No subscriptions yet"} emptyMessage={isRenewal ? "Active subscriptions nearing renewal will appear here." : "VYRO subscription records will appear here when assigned to a gym."} columns={[
      { label: "GYM", className: "table-primary", render: (row) => <Link href={`/platform/gyms/${row.gym_id}`}>{(row.gyms as unknown as { name?: string } | null)?.name || "Gym"}</Link> },
      { label: "PLAN", render: (row) => row.plan_name },
      { label: "PERIOD", render: (row) => row.billing_period },
      { label: "AMOUNT", render: (row) => new Intl.NumberFormat("en-IN", { style: "currency", currency: row.currency }).format(Number(row.amount)) },
      { label: "START", render: (row) => formatDate(row.starts_on) },
      { label: "RENEWAL", render: (row) => formatDate(row.expires_on) },
      { label: "STATUS", render: (row) => <span className={`status-badge ${row.status}`}>{row.status}</span> },
    ]} />}
  </>;
}
