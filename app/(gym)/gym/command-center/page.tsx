import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CreditCard, Dumbbell, Inbox, IdCard, RefreshCw, UserRoundPlus, Wallet } from "lucide-react";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { QuickActionLink } from "@/components/ui/quick-action-link";
import { StatCard } from "@/components/ui/stat-card";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Command Center" };

type GymReport = {
  memberships?: { active?: number; expiring?: number; expired?: number };
  attendance?: { by_day?: Array<{ date: string; check_ins: number }> };
  payments?: { revenue_by_day?: Array<{ date: string; amount: number }> };
};
type RevenueBreakdown = { membership_revenue?: number; registration_revenue?: number; total_revenue?: number; by_day?: Array<{ date: string; amount: number }> };

function getLocalDate(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
}

function formatMoney(value: number | string | null | undefined, currency: string) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value));
  } catch {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value));
  }
}

export default async function CommandCenterPage() {
  const { gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const [{ data: gym, error: gymError }, { data: settings }, summaryResult] = await Promise.all([
    supabase.from("gyms").select("name").eq("id", gymId).maybeSingle(),
    supabase.from("gym_settings").select("timezone, currency").eq("gym_id", gymId).maybeSingle(),
    supabase.rpc("get_gym_dashboard_summary", { target_gym_id: gymId }),
  ]);
  const today = getLocalDate(settings?.timezone ?? "Asia/Kolkata");
  const startDate = new Date(`${today}T00:00:00Z`); startDate.setUTCDate(startDate.getUTCDate() - 29);
  const { data: report, error: reportError } = await supabase.rpc("get_gym_report", {
    target_gym_id: gymId,
    p_from: startDate.toISOString().slice(0, 10),
    p_to: today,
  });
  const monthStart = `${today.slice(0, 7)}-01`;
  const [{ data: financial, error: financialError }, { data: activity, error: activityError }, { data: monthRevenue, error: monthRevenueError }, { data: todayRevenue, error: todayRevenueError }] = await Promise.all([
    supabase.rpc("get_gym_financial_snapshot", { p_as_of: today }),
    supabase.from("audit_logs").select("id, action, entity_type, created_at").eq("gym_id", gymId).order("created_at", { ascending: false }).limit(8),
    supabase.rpc("get_gym_revenue_breakdown", { p_from: monthStart, p_to: today }),
    supabase.rpc("get_gym_revenue_breakdown", { p_from: today, p_to: today }),
  ]);
  const summary = summaryResult.data?.[0];
  const membershipStats = report as GymReport | null;
  const monthRevenueData = monthRevenue as RevenueBreakdown | null;
  const todayRevenueData = todayRevenue as RevenueBreakdown | null;
  const queryError = Boolean(gymError || summaryResult.error || reportError || financialError || activityError || monthRevenueError || todayRevenueError);
  const currency = settings?.currency?.trim() || "INR";
  const gymInitial = gym?.name?.trim().charAt(0).toUpperCase() || "G";

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <PageHeader
        eyebrow="Gym command center"
        title="Your gym at a glance"
        description="Live membership, attendance, revenue, and expense activity for this gym."
      >
        <div className="flex max-w-full items-center gap-3 rounded-md border border-border/80 bg-surface px-3.5 py-3 shadow-sm sm:min-w-56">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-accent/20 bg-accent-subtle font-display text-lg font-semibold text-accent" aria-hidden="true">
            {gymInitial}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Current gym</p>
            <p className="max-w-56 truncate text-sm font-medium">{gym?.name ?? (gymError ? "Gym unavailable" : "Gym workspace")}</p>
          </div>
        </div>
      </PageHeader>

      {queryError ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Some gym metrics could not be loaded. Refresh the page or review gym data access.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UserRoundPlus} label="Total members" value={queryError ? "—" : String(summary?.total_members ?? 0)} hint="In your gym" />
        <StatCard icon={IdCard} label="Active members" value={queryError ? "—" : String(summary?.active_members ?? 0)} hint="Non-archived and current" />
        <StatCard icon={RefreshCw} label="Expiring soon" value={queryError ? "—" : String(membershipStats?.memberships?.expiring ?? 0)} hint="Within 30 days" />
        <StatCard icon={IdCard} label="Expired" value={queryError ? "—" : String(summary?.expired_members ?? membershipStats?.memberships?.expired ?? 0)} hint="Membership periods" />
        <StatCard icon={CalendarCheck} label="Today's attendance" value={queryError ? "—" : String(summary?.today_attendance ?? 0)} hint="Check-ins today" />
        <StatCard icon={CreditCard} label="Today's payments" value={queryError ? "—" : formatMoney(todayRevenueData?.total_revenue, currency)} hint={`Membership ${formatMoney(todayRevenueData?.membership_revenue, currency)} · registration ${formatMoney(todayRevenueData?.registration_revenue, currency)}`} />
        <StatCard icon={CreditCard} label="Collected this month" value={queryError ? "—" : formatMoney(monthRevenueData?.total_revenue, currency)} hint={`Membership ${formatMoney(monthRevenueData?.membership_revenue, currency)} · registration ${formatMoney(monthRevenueData?.registration_revenue, currency)}`} />
        <StatCard icon={CreditCard} label="Expected" value={queryError ? "—" : formatMoney(financial?.expected_revenue, currency)} hint="Current membership totals" />
        <StatCard icon={Wallet} label="Expenses this month" value={queryError ? "—" : formatMoney(financial?.month_expenses, currency)} hint="Recorded operating costs" />
        <StatCard icon={Wallet} label="Net income" value={queryError ? "—" : formatMoney(Number(monthRevenueData?.total_revenue ?? 0) - Number(financial?.month_expenses ?? 0), currency)} hint="Total collected revenue minus expenses" />
        <StatCard icon={CreditCard} label="Outstanding" value={queryError ? "—" : formatMoney(financial?.outstanding, currency)} hint="Current membership balance" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CommandCenterCard title="Membership attention">
          {queryError ? (
            <p className="text-sm text-muted-foreground">Membership status is unavailable right now.</p>
          ) : membershipStats?.memberships?.expiring ? (
            <div className="space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">
                {membershipStats.memberships.expiring} {membershipStats.memberships.expiring === 1 ? "membership is" : "memberships are"} due to expire within 30 days.
              </p>
              <Button asChild variant="secondary"><Link href="/gym/members?membership_status=expiring">Review members</Link></Button>
            </div>
          ) : (
            <EmptyState icon={Inbox} title="No renewals need attention" description="Memberships that are due to expire within 30 days will appear here." />
          )}
        </CommandCenterCard>

        <CommandCenterCard title="Quick actions">
          <div className="grid gap-2 sm:grid-cols-2">
            <QuickActionLink href="/gym/members" label="Add a member" description="Create a gym member record" icon={UserRoundPlus} />
            <QuickActionLink href="/gym/members/new" label="Add a member" description="Member, plan, and payment together" icon={UserRoundPlus} />
            <QuickActionLink href="/gym/members" label="Renew a membership" description="Open a member profile" icon={RefreshCw} />
            <QuickActionLink href="/gym/attendance" label="Record attendance" description="Open today's check-ins" icon={CalendarCheck} />
            <QuickActionLink href="/gym/expenses" label="Add an expense" description="Track operating costs" icon={Wallet} />
          </div>
        </CommandCenterCard>
      </div>

      {!queryError ? <div className="grid gap-4 xl:grid-cols-2">
        <CommandCenterCard title="Recent activity">{activity?.length ? <ul className="space-y-2">{activity.map((event) => <li key={event.id} className="flex justify-between gap-3 border-b border-border/60 pb-2 text-sm"><span className="min-w-0 truncate">{String(event.action).replaceAll(".", " ").replaceAll("_", " ")}</span><time className="shrink-0 text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: settings?.timezone ?? "Asia/Kolkata" }).format(new Date(event.created_at))}</time></li>)}</ul> : <EmptyState icon={Inbox} title="No recent activity" description="Member, payment, renewal, and expense events will appear here." />}</CommandCenterCard>
        <CommandCenterCard title="30-day trends">{membershipStats?.payments?.revenue_by_day?.length || membershipStats?.attendance?.by_day?.length ? <div className="grid gap-4 sm:grid-cols-2"><div><p className="mb-2 text-xs text-muted-foreground">Membership revenue</p><div className="flex h-28 items-end gap-1">{(membershipStats.payments?.revenue_by_day ?? []).slice(-14).map((point) => <div key={point.date} title={`${point.date}: ${formatMoney(point.amount, currency)}`} className="flex-1 rounded-t bg-accent/75" style={{ height: `${Math.max(3, point.amount / Math.max(1, ...membershipStats.payments!.revenue_by_day!.map((p) => Number(p.amount))) * 100)}%` }} />)}</div></div><div><p className="mb-2 text-xs text-muted-foreground">Attendance check-ins</p><div className="flex h-28 items-end gap-1">{(membershipStats.attendance?.by_day ?? []).slice(-14).map((point) => <div key={point.date} title={`${point.date}: ${point.check_ins}`} className="flex-1 rounded-t bg-positive/60" style={{ height: `${Math.max(3, point.check_ins / Math.max(1, ...membershipStats.attendance!.by_day!.map((p) => Number(p.check_ins))) * 100)}%` }} />)}</div></div></div> : <EmptyState icon={Inbox} title="No trend data yet" description="Revenue and attendance trends will build as activity is recorded." />}</CommandCenterCard>
      </div> : null}

      {!queryError && summary?.total_members === 0 ? (
        <CommandCenterCard title="Get started">
          <EmptyState
            icon={Dumbbell}
            title="Your member list is ready to grow"
            description="There are no members recorded for this gym yet. Add a member to begin tracking memberships, attendance, and payments."
            action={{ label: "Add first member", href: "/gym/members" }}
          />
        </CommandCenterCard>
      ) : null}
    </div>
  );
}
