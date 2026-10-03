import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/dashboard";
import { ServerTable } from "@/components/server-table";
import { formatDate, formatDateTime } from "@/lib/dashboard-data";

type View = "subscriptions" | "renewals" | "revenue";

export async function PlatformRecords({ view }: { view: View }) {
  const supabase = await createSupabaseServerClient();
  if (view === "revenue") {
    const { data, error } = await supabase.from("platform_subscription_payments")
      .select("id, amount, currency, paid_at, reference, status, gyms(name)")
      .order("paid_at", { ascending: false }).limit(50);
    return <><DashboardHeader eyebrow="Platform billing" title="Revenue" description="Payments from gyms to VYRO. Gym member payments are kept in a separate ledger." />
      {error ? <div className="notice">Platform billing data could not be loaded.</div> : <ServerTable rows={data || []} emptyTitle="No platform payments yet" emptyMessage="VYRO subscription payments will appear here when recorded." columns={[
        { label: "GYM", className: "table-primary", render: (row) => (row.gyms as unknown as { name?: string } | null)?.name || "Gym" },
        { label: "AMOUNT", render: (row) => new Intl.NumberFormat("en-IN", { style: "currency", currency: row.currency }).format(Number(row.amount)) },
        { label: "PAID AT", render: (row) => formatDateTime(row.paid_at) },
        { label: "REFERENCE", render: (row) => row.reference || "—" },
        { label: "STATUS", render: (row) => <span className={`status-badge ${row.status}`}>{row.status}</span> },
      ]} />}</>;
  }
  const isRenewal = view === "renewals";
  let request = supabase.from("platform_subscriptions")
    .select("id, gym_id, plan_name, amount, currency, starts_on, expires_on, status, gyms(name)")
    .order(isRenewal ? "expires_on" : "created_at", { ascending: true }).limit(100);
  if (isRenewal) request = request.eq("status", "active").gte("expires_on", new Date().toISOString().slice(0, 10));
  const { data, error } = await request;
  return <><DashboardHeader eyebrow="Platform billing" title={isRenewal ? "Upcoming renewals" : "Subscriptions"} description={isRenewal ? "Active VYRO subscriptions ordered by renewal date." : "Plans and terms for each gym’s VYRO subscription."} />
    {error ? <div className="notice">Subscription data could not be loaded.</div> : <ServerTable rows={data || []} emptyTitle={isRenewal ? "No upcoming renewals" : "No subscriptions yet"} emptyMessage={isRenewal ? "Active subscriptions nearing renewal will appear here." : "VYRO subscription records will appear here when assigned to a gym."} columns={[
      { label: "GYM", className: "table-primary", render: (row) => <Link href={`/platform/gyms/${row.gym_id}`}>{(row.gyms as unknown as { name?: string } | null)?.name || "Gym"}</Link> },
      { label: "PLAN", render: (row) => row.plan_name },
      { label: "AMOUNT", render: (row) => new Intl.NumberFormat("en-IN", { style: "currency", currency: row.currency }).format(Number(row.amount)) },
      { label: "START", render: (row) => formatDate(row.starts_on) },
      { label: "RENEWAL", render: (row) => formatDate(row.expires_on) },
      { label: "STATUS", render: (row) => <span className={`status-badge ${row.status}`}>{row.status}</span> },
    ]} />}
  </>;
}
