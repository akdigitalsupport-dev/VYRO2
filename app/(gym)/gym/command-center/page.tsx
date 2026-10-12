import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck, CreditCard, Dumbbell, Inbox, IdCard, RefreshCw, UserRoundPlus, Wallet,
  type LucideIcon,
} from "lucide-react";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { QuickActionLink } from "@/components/ui/quick-action-link";
import { StatCard } from "@/components/ui/stat-card";
import { InteractiveTrendChart, type TrendPoint } from "@/components/dashboard/interactive-trend-chart";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Command Center" };

type GymReport = {
  memberships?: { active?: number; expiring?: number; expired?: number };
  attendance?: { by_day?: Array<{ date: string; check_ins: number }> };
  payments?: { revenue_by_day?: Array<{ date: string; amount: number }> };
};
type RevenueDay = { date: string; amount: number; membership_amount?: number; registration_amount?: number };
type RevenueBreakdown = {
  membership_revenue?: number;
  registration_revenue?: number;
  total_revenue?: number;
  by_day?: RevenueDay[];
};

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

function LinkedStatCard({
  href,
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive";
}) {
  return (
    <Link
      href={href}
      aria-label={"View " + label.toLowerCase() + ". " + (hint ?? "")}
      className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <StatCard
        icon={icon}
        label={label}
        value={value}
        hint={hint}
        tone={tone}
        className="h-full transition-[transform,border-color,box-shadow] duration-150 group-hover:-translate-y-0.5 group-hover:border-accent/50 group-hover:shadow-lg"
      />
    </Link>
  );
}

export default async function CommandCenterPage() {
  const { gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const [{ data: settings, error: settingsError }, summaryResult] = await Promise.all([
    supabase.from("gym_settings").select("timezone, currency").eq("gym_id", gymId).maybeSingle(),
    supabase.rpc("get_gym_dashboard_summary", { target_gym_id: gymId }),
  ]);

  const today = getLocalDate(settings?.timezone ?? "Asia/Kolkata");
  const startDate = new Date(today + "T00:00:00Z");
  startDate.setUTCDate(startDate.getUTCDate() - 29);
  const startIso = startDate.toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";
  const revenueStartDate = monthStart < startIso ? monthStart : startIso;

  const [
    { data: report, error: reportError },
    { data: financial, error: financialError },
    { data: activity, error: activityError },
    { data: trendRevenue, error: trendRevenueError },
  ] = await Promise.all([
    supabase.rpc("get_gym_report", {
      target_gym_id: gymId,
      p_from: startDate.toISOString().slice(0, 10),
      p_to: today,
    }),
    supabase.rpc("get_gym_financial_snapshot", { p_as_of: today }),
    supabase.from("audit_logs").select("id, action, entity_type, created_at").eq("gym_id", gymId).order("created_at", { ascending: false }).limit(8),
    supabase.rpc("get_gym_revenue_breakdown", { p_from: revenueStartDate, p_to: today }),
  ]);

  const summary = summaryResult.data?.[0];
  const membershipStats = report as GymReport | null;
  const trendRevenueData = trendRevenue as RevenueBreakdown | null;
  const revenueDays = trendRevenueData?.by_day ?? [];
  const monthRevenueDays = revenueDays.filter((point) => point.date >= monthStart);
  const monthRevenueTotal = monthRevenueDays.reduce((sum, point) => sum + Number(point.amount ?? 0), 0);
  const monthMembershipRevenue = monthRevenueDays.reduce((sum, point) => sum + Number(point.membership_amount ?? 0), 0);
  const monthRegistrationRevenue = monthRevenueDays.reduce((sum, point) => sum + Number(point.registration_amount ?? 0), 0);
  const todayRevenueTotal = revenueDays.find((point) => point.date === today)?.amount ?? 0;
  const queryError = Boolean(settingsError || summaryResult.error || reportError || financialError || activityError || trendRevenueError);
  const currency = settings?.currency?.trim() || "INR";
  const expiringCount = Number(membershipStats?.memberships?.expiring ?? 0);
  const expiredCount = Number(summary?.expired_members ?? membershipStats?.memberships?.expired ?? 0);
  const chartDates = Array.from({ length: 30 }, (_, offset) => {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
  const incomeByDate = new Map(revenueDays.map((point) => [point.date, Number(point.amount ?? 0)]));
  const incomeChartData: TrendPoint[] = chartDates.map((date) => ({ date, value: incomeByDate.get(date) ?? 0 }));
  const attendanceByDate = new Map((membershipStats?.attendance?.by_day ?? []).map((point) => [point.date, Number(point.check_ins ?? 0)]));
  const attendanceChartData: TrendPoint[] = chartDates.map((date) => ({ date, value: attendanceByDate.get(date) ?? 0 }));

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 sm:space-y-7">
      <PageHeader
        eyebrow="Gym command center"
        title="Your gym at a glance"
        description="Start with the items that need attention, then review activity and performance."
      />

      {queryError ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Some dashboard metrics could not be loaded. Refresh the page or review gym data access.
        </p>
      ) : null}

      <section aria-labelledby="needs-attention-title" className="space-y-3">
        <div>
          <h2 id="needs-attention-title" className="font-display text-lg font-semibold">Needs attention today</h2>
          <p className="mt-1 text-sm text-muted-foreground">Open any count or value to continue in the relevant workspace.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <LinkedStatCard icon={RefreshCw} label="Expiring soon" value={queryError ? "—" : String(expiringCount)} hint="Memberships ending within 30 days" href="/gym/members?membership_status=expiring" />
          <LinkedStatCard icon={IdCard} label="Expired memberships" value={queryError ? "—" : String(expiredCount)} hint="Review members with expired terms" href="/gym/members?membership_status=expired" />
          <LinkedStatCard icon={Wallet} label="Outstanding dues" value={queryError ? "—" : formatMoney(financial?.outstanding, currency)} hint="Unpaid and partially paid balances" href="/gym/members/billing?status=outstanding" />
          <LinkedStatCard icon={CalendarCheck} label="Today's attendance" value={queryError ? "—" : String(summary?.today_attendance ?? 0)} hint="Open today's check-ins" href="/gym/attendance" />
        </div>
      </section>

      <CommandCenterCard title="Quick actions">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <QuickActionLink href="/gym/members/new" label="Add a member" description="Member, plan, and initial payment" icon={UserRoundPlus} />
          <QuickActionLink href="/gym/attendance" label="Mark attendance" description="Open today's check-ins" icon={CalendarCheck} />
          <QuickActionLink href="/gym/members/billing" label="Record a payment" description="Open member balances and payment records" icon={CreditCard} />
          <QuickActionLink href="/gym/members" label="Renew a membership" description="Find a member and open their profile" icon={RefreshCw} />
          <QuickActionLink href="/gym/expenses" label="Add an expense" description="Record an operating cost" icon={Wallet} />
        </div>
      </CommandCenterCard>

      <section aria-labelledby="business-snapshot-title" className="space-y-3">
        <div>
          <h2 id="business-snapshot-title" className="font-display text-lg font-semibold">Business snapshot</h2>
          <p className="mt-1 text-sm text-muted-foreground">Core member and financial totals for this gym.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <LinkedStatCard icon={UserRoundPlus} label="Total members" value={queryError ? "—" : String(summary?.total_members ?? 0)} hint="All member records in this gym" href="/gym/members" />
          <LinkedStatCard icon={IdCard} tone="positive" label="Active members" value={queryError ? "—" : String(summary?.active_members ?? 0)} hint="Current active memberships" href="/gym/members?member_status=active&membership_status=active" />
          <LinkedStatCard icon={CreditCard} label="Today's payments" value={queryError ? "—" : formatMoney(todayRevenueTotal, currency)} hint="Membership and registration receipts today" href="/gym/members/billing" />
          <LinkedStatCard icon={CreditCard} label="Collected this month" value={queryError ? "—" : formatMoney(monthRevenueTotal, currency)} hint={`Membership ${formatMoney(monthMembershipRevenue, currency)} · registration ${formatMoney(monthRegistrationRevenue, currency)}`} href="/gym/reports" />
          <LinkedStatCard icon={CreditCard} label="Expected revenue" value={queryError ? "—" : formatMoney(financial?.expected_revenue, currency)} hint="Current membership totals" href="/gym/reports" />
          <LinkedStatCard icon={Wallet} label="Expenses this month" value={queryError ? "—" : formatMoney(financial?.month_expenses, currency)} hint="Recorded operating costs" href="/gym/expenses" />
          <LinkedStatCard icon={Wallet} label="Net income" value={queryError ? "—" : formatMoney(monthRevenueTotal - Number(financial?.month_expenses ?? 0), currency)} hint="Collected revenue minus recorded expenses" href="/gym/reports" />
        </div>
      </section>

      <CommandCenterCard title="Performance trends">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Explore daily income and attendance over the last month.</p>
          <Link href="/gym/reports" className="text-xs font-semibold text-accent hover:underline">View reports</Link>
        </div>
        <InteractiveTrendChart income={incomeChartData} attendance={attendanceChartData} currency={currency} />
      </CommandCenterCard>

      <CommandCenterCard title="Recent activity">
        {activityError ? (
          <p role="alert" className="text-sm text-destructive">Recent activity could not be loaded.</p>
        ) : activity?.length ? (
          <ul className="space-y-2">
            {activity.map((event) => (
              <li key={event.id} className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-2 text-sm last:border-b-0">
                <span className="min-w-0 flex-1 break-words">{String(event.action).replaceAll(".", " ").replaceAll("_", " ")}</span>
                <time className="shrink-0 text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: settings?.timezone ?? "Asia/Kolkata" }).format(new Date(event.created_at))}</time>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Inbox} title="No recent activity" description="Member, payment, renewal, and expense events will appear here." />
        )}
      </CommandCenterCard>

      {!queryError && summary?.total_members === 0 ? (
        <CommandCenterCard title="Get started">
          <EmptyState icon={Dumbbell} title="Your member list is ready to grow" description="There are no members recorded for this gym yet. Add a member to begin tracking memberships, attendance, and payments." action={{ label: "Add first member", href: "/gym/members/new" }} />
        </CommandCenterCard>
      ) : null}
    </div>
  );
}
