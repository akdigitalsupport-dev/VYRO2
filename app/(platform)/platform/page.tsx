import type { Metadata } from "next";
import { Building2, ClipboardList, CreditCard, HeartPulse, Inbox, Layers3 } from "lucide-react";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { QuickActionLink } from "@/components/ui/quick-action-link";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

const subscriptionStatuses = ["active", "expired", "suspended", "cancelled"] as const;

const subscriptionBadgeVariant = {
  active: "positive",
  expired: "warning",
  suspended: "danger",
  cancelled: "default",
} as const;

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function PlatformOverviewPage() {
  const supabase = await createServerSupabaseClient();
  const [totalGyms, activeGyms, inactiveGyms, ...subscriptionCounts] = await Promise.all([
    supabase.from("gyms").select("id", { count: "exact", head: true }),
    supabase.from("gyms").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("gyms").select("id", { count: "exact", head: true }).neq("status", "active"),
    ...subscriptionStatuses.map((status) =>
      supabase.from("platform_subscriptions").select("id", { count: "exact", head: true }).eq("status", status),
    ),
  ]);
  const { data: recentActivity, error: activityError } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const summaryError = totalGyms.error || activeGyms.error || inactiveGyms.error || subscriptionCounts.some((result) => result.error);
  const subscriptionTotal = subscriptionCounts.reduce((sum, result) => sum + (result.count ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <PageHeader
        eyebrow="Platform overview"
        title="Your network at a glance"
        description="A live view of customer gyms, subscription status, and recent platform activity."
      />

      {summaryError ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Platform summary could not be loaded. Refresh the page or review platform data access.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Total gyms" value={summaryError ? "—" : String(totalGyms.count ?? 0)} hint="Customer workspaces" />
        <StatCard icon={HeartPulse} label="Active gyms" value={summaryError ? "—" : String(activeGyms.count ?? 0)} hint="Currently active" />
        <StatCard icon={Layers3} label="Inactive or suspended" value={summaryError ? "—" : String(inactiveGyms.count ?? 0)} hint="Not marked active" />
        <StatCard icon={CreditCard} label="Subscriptions" value={summaryError ? "—" : String(subscriptionTotal)} hint="Across recorded statuses" />
      </div>

      <CommandCenterCard title="Subscription status">
        {summaryError ? (
          <p className="text-sm text-muted-foreground">Subscription status is unavailable right now.</p>
        ) : subscriptionTotal === 0 ? (
          <EmptyState
            icon={Building2}
            title="No subscriptions yet"
            description="Subscription and plan status will appear here when records are present."
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {subscriptionStatuses.map((status, index) => (
              <article key={status} className="flex items-center justify-between gap-3 rounded-md border border-border/80 bg-background/35 px-4 py-3">
                <div className="space-y-2">
                  <Badge variant={subscriptionBadgeVariant[status]}>{statusLabel(status)}</Badge>
                  <p className="font-display text-2xl font-semibold tabular-nums tracking-[-0.04em]">
                    {String(subscriptionCounts[index]?.count ?? 0)}
                  </p>
                </div>
                <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
              </article>
            ))}
          </div>
        )}
      </CommandCenterCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <CommandCenterCard title="Recent audit activity">
          {activityError ? (
            <p role="alert" className="text-sm text-muted-foreground">Recent activity could not be loaded.</p>
          ) : recentActivity?.length ? (
            <ul className="divide-y divide-border">
              {recentActivity.map((event) => (
                <li key={event.id} className="flex min-w-0 items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{event.action}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{event.entity_type}</p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={event.created_at}>
                    {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Inbox} title="No audit activity" description="Platform events will appear here as they are recorded." />
          )}
        </CommandCenterCard>

        <CommandCenterCard title="Quick actions">
          <div className="grid gap-2">
            <QuickActionLink href="/platform/gyms" label="Browse gyms" description="View customer workspaces" icon={Building2} />
            <QuickActionLink href="/platform/revenue" label="Review subscriptions" description="Check plan and billing status" icon={CreditCard} />
            <QuickActionLink href="/platform/audit" label="Open audit logs" description="See recent platform events" icon={ClipboardList} />
          </div>
        </CommandCenterCard>
      </div>
    </div>
  );
}
