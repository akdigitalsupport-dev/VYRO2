import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type GymFilter = "all" | "active" | "suspended" | "trial";

const filterLabels: Record<GymFilter, string> = {
  all: "All gyms",
  active: "Active gyms",
  suspended: "Suspended gyms",
  trial: "Trial gyms",
};

export async function GymDirectory({
  filter = "all",
  searchQuery = "",
  title,
  description,
}: {
  filter?: GymFilter;
  searchQuery?: string;
  title?: string;
  description?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("gyms")
    .select("id,name,owner_name,email,phone,address,status,created_at,platform_subscriptions(id,plan_name,amount,currency,status,starts_on,expires_on,billing_period,created_at)")
    .order("created_at", { ascending: false });

  const gyms = (data ?? []).map((gym) => {
    const subscriptions = [...(gym.platform_subscriptions ?? [])].sort((a, b) =>
      String(b.created_at ?? b.starts_on).localeCompare(String(a.created_at ?? a.starts_on)),
    );
    return { ...gym, subscription: subscriptions[0] ?? null };
  }).filter((gym) => {
    const subscriptionStatus = gym.subscription?.status;
    const matchesFilter =
      filter === "all" ||
      (filter === "trial" && subscriptionStatus === "trial") ||
      (filter === "active" && gym.status !== "suspended" && subscriptionStatus === "active") ||
      (filter === "suspended" && (gym.status === "suspended" || subscriptionStatus === "suspended"));
    if (!matchesFilter) return false;
    const needle = searchQuery.trim().toLocaleLowerCase();
    return !needle || [
      gym.name,
      gym.owner_name ?? "",
      gym.email ?? "",
      gym.phone ?? "",
      gym.address ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(needle));
  });

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <PageHeader
        eyebrow="Gyms"
        title={title ?? filterLabels[filter]}
        description={description ?? "Customer workspaces and their current VYRO subscription state."}
      >
        <Link href="/platform/gyms/new" className="inline-flex min-h-10 items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition hover:brightness-110">
          Add Gym
        </Link>
      </PageHeader>

      <form method="get" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center">
        <label htmlFor="gym-search" className="sr-only">Search gyms</label>
        <input
          id="gym-search"
          name="q"
          type="search"
          defaultValue={searchQuery}
          placeholder="Search by gym, owner, email, phone, or address"
          className="min-h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-elevated px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-background">
          Search
        </button>
      </form>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Gym records could not be loaded. Refresh the page or review Platform Admin data access.
        </p>
      ) : gyms.length === 0 ? (
        <EmptyState
          icon={undefined}
          title={searchQuery ? "No matching gyms" : filter === "trial" ? "No active trials" : "No gyms in this view"}
          description={searchQuery ? "Try a different search term." : "Create a gym workspace to see it listed here. New workspaces can start with a free trial."}
          action={filter === "all" || filter === "trial" ? { label: "Add Gym", href: "/platform/gyms/new" } : undefined}
        />
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-[0_10px_28px_rgba(0,0,0,0.1)]">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-sm font-medium">{gyms.length} {gyms.length === 1 ? "gym" : "gyms"}</p>
            <p className="text-xs text-muted-foreground">Live production records</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-background/55 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Gym / Owner</th>
                  <th className="px-4 py-3 font-semibold">Subscription</th>
                  <th className="px-4 py-3 font-semibold">Gym status</th>
                  <th className="px-4 py-3 font-semibold">Trial / expiry</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {gyms.map((gym) => (
                  <tr key={gym.id} className="align-top transition-colors hover:bg-background/35">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{gym.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{gym.owner_name || "Owner not recorded"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{gym.email || "No email"}</p>
                    </td>
                    <td className="px-4 py-3">
                      {gym.subscription ? (
                        <>
                          <p className="font-medium">{gym.subscription.plan_name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{formatAmount(gym.subscription.amount, gym.subscription.currency)} · {humanize(gym.subscription.status)}</p>
                        </>
                      ) : <span className="text-xs text-muted-foreground">No subscription record</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusClass(gym.status)}`}>{humanize(gym.status)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {gym.subscription ? (
                        <>
                          <p>Starts {formatDate(gym.subscription.starts_on)}</p>
                          <p className="mt-1">Ends {formatDate(gym.subscription.expires_on)}</p>
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(gym.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string) {
  if (status === "active" || status === "trial") return "border-positive/30 bg-positive/10 text-positive";
  if (status === "suspended" || status === "cancelled") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (status === "expiring" || status === "past_due") return "border-warning/30 bg-warning/10 text-warning";
  return "border-border bg-background text-muted-foreground";
}

function formatAmount(amount: number | string, currency: string) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "Price unavailable";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.trim(), maximumFractionDigits: 2 }).format(numeric);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(match.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(match);
}
