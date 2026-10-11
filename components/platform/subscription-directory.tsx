import Link from "next/link";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SubscriptionFilter = "all" | "trial" | "active" | "past_due" | "suspended" | "expired" | "cancelled";

const titles: Record<SubscriptionFilter, string> = {
  all: "SaaS Subscriptions",
  trial: "Trial Subscriptions",
  active: "Active Subscriptions",
  past_due: "Past-due Subscriptions",
  suspended: "Suspended Subscriptions",
  expired: "Expired Subscriptions",
  cancelled: "Cancelled Subscriptions",
};

export async function SubscriptionDirectory({
  filter = "all",
  searchQuery = "",
  title,
  description,
}: {
  filter?: SubscriptionFilter;
  searchQuery?: string;
  title?: string;
  description?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("platform_subscriptions")
    .select("id,gym_id,plan_name,amount,currency,status,billing_period,starts_on,expires_on,created_at,gyms!platform_subscriptions_gym_id_fkey(id,name,owner_name,email,status)")
    .order("created_at", { ascending: false });

  const rows = (data ?? []).filter((subscription) => {
    const gym = Array.isArray(subscription.gyms) ? subscription.gyms[0] : subscription.gyms;
    const needle = searchQuery.trim().toLocaleLowerCase();
    const matchesFilter = filter === "all" || subscription.status === filter;
    const matchesQuery = !needle || [
      subscription.plan_name,
      gym?.name ?? "",
      gym?.owner_name ?? "",
      gym?.email ?? "",
    ].some((value) => String(value).toLocaleLowerCase().includes(needle));
    return matchesFilter && matchesQuery;
  });

  const liveCount = (data ?? []).filter((subscription) => subscription.status === "active" || subscription.status === "trial").length;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <PageHeader
        eyebrow="Revenue"
        title={title ?? titles[filter]}
        description={description ?? "VYRO's SaaS subscription ledger, separate from each gym's member billing."}
      >
        <Link href="/platform/gyms/new" className="inline-flex min-h-10 items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition hover:brightness-110">
          Add trial gym
        </Link>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Subscriptions" value={String(data?.length ?? 0)} />
        <Stat label="Active or trial" value={String(liveCount)} />
        <Stat label="Past due" value={String((data ?? []).filter((subscription) => subscription.status === "past_due").length)} />
      </div>

      <form method="get" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center">
        <label htmlFor="subscription-search" className="sr-only">Search subscriptions</label>
        <input id="subscription-search" name="q" type="search" defaultValue={searchQuery} placeholder="Search by plan, gym, owner or email" className="min-h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-elevated px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-background">Search</button>
      </form>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Subscription records could not be loaded.</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title={searchQuery ? "No matching subscriptions" : "No subscriptions in this view"} description={searchQuery ? "Try another search term." : "New gyms can start on a free trial. Paid subscription activation will be available after selecting a SaaS plan and confirming payment."} action={{ label: "Add trial gym", href: "/platform/gyms/new" }} />
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-[0_10px_28px_rgba(0,0,0,0.1)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-background/55 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Gym</th>
                  <th className="px-4 py-3 font-semibold">Plan / price</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Billing period</th>
                  <th className="px-4 py-3 font-semibold">Start</th>
                  <th className="px-4 py-3 font-semibold">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((subscription) => {
                  const gym = Array.isArray(subscription.gyms) ? subscription.gyms[0] : subscription.gyms;
                  return (
                    <tr key={subscription.id} className="align-top transition-colors hover:bg-background/35">
                      <td className="px-4 py-3">
                        <p className="font-medium">{gym?.name ?? "Unknown gym"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{gym?.owner_name ?? gym?.email ?? "Owner not recorded"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{subscription.plan_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatAmount(subscription.amount, subscription.currency)}</p>
                      </td>
                      <td className="px-4 py-3"><Status status={subscription.status} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{humanize(subscription.billing_period)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(subscription.starts_on)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(subscription.expires_on)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <article className="rounded-lg border border-border bg-surface px-4 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p></article>;
}

function Status({ status }: { status: string }) {
  const color = status === "active" || status === "trial"
    ? "border-positive/30 bg-positive/10 text-positive"
    : status === "past_due" || status === "expired"
      ? "border-warning/30 bg-warning/10 text-warning"
      : status === "suspended" || status === "cancelled"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-background text-muted-foreground";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${color}`}>{humanize(status)}</span>;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAmount(amount: number | string, currency: string) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "Price unavailable";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.trim(), maximumFractionDigits: 2 }).format(numeric);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(date);
}
