import type { Metadata } from "next";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { PageHeader } from "@/components/ui/page-header";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const metadata: Metadata = { title: "Reports" };
type Period = "daily" | "weekly" | "monthly" | "yearly";
function localDay(zone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function offsetDay(day: string, amount: number) { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10); }
function periodStart(day: string, period: Period) { if (period === "daily") return day; if (period === "weekly") return offsetDay(day, -6); if (period === "monthly") return `${day.slice(0, 7)}-01`; return `${day.slice(0, 4)}-01-01`; }
function BarSeries({ title, rows, field, currency }: { title: string; rows: Record<string, unknown>[]; field: string; currency: string }) {
 const values = rows.map((r) => Number(r[field] ?? 0)); const max = Math.max(...values, 1);
 return <figure className="rounded-lg border border-border/80 bg-surface p-4"><figcaption className="font-display text-sm font-semibold">{title}</figcaption>{rows.length ? <div className="mt-4 flex h-40 items-end gap-1 overflow-x-auto">{rows.slice(-31).map((row, i) => { const n = Number(row[field] ?? 0); const label = String(row.date ?? row.day ?? row.category ?? i + 1); return <div key={`${label}-${i}`} className="group flex h-full min-w-6 flex-1 flex-col justify-end" title={`${label}: ${new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(n)}`}><div className="rounded-t bg-accent/80 group-hover:bg-accent" style={{ height: `${Math.max(n ? n / max * 100 : 2, 2)}%` }}/><span className="mt-1 truncate text-center text-[9px] text-muted-foreground">{label.slice(-5)}</span></div>; })}</div> : <p className="mt-5 text-sm text-muted-foreground">No records in this period.</p>}</figure>;
}
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
 const { gymId } = await requireGymAdminContext(); const params = await searchParams; const period: Period = ["daily", "weekly", "monthly", "yearly"].includes(params.period ?? "") ? params.period as Period : "monthly";
 const supabase = await createServerSupabaseClient(); const { data: settings } = await supabase.from("gym_settings").select("timezone, currency").eq("gym_id", gymId).maybeSingle();
 const zone = settings?.timezone ?? "Asia/Kolkata", currency = settings?.currency ?? "INR", to = localDay(zone), from = periodStart(to, period);
 const [{ data: report, error }, { data: expense, error: expenseError }, { data: finance, error: financeError }, { data: revenueData, error: revenueError }] = await Promise.all([
  supabase.rpc("get_gym_report", { target_gym_id: gymId, p_from: from, p_to: to }),
  supabase.rpc("get_gym_expense_report", { p_from: from, p_to: to }),
  supabase.rpc("get_gym_financial_snapshot", { p_as_of: to }),
  supabase.rpc("get_gym_revenue_breakdown", { p_from: from, p_to: to }),
 ]);
 const failed = error || expenseError || financeError || revenueError; const revenueRows = ((revenueData as { by_day?: Record<string, unknown>[] } | null)?.by_day ?? []) as Record<string, unknown>[]; const expenseRows = (expense?.by_day ?? []) as Record<string, unknown>[];
 const membershipRevenue = Number((revenueData as { membership_revenue?: number } | null)?.membership_revenue ?? 0); const registrationRevenue = Number((revenueData as { registration_revenue?: number } | null)?.registration_revenue ?? 0); const revenue = Number((revenueData as { total_revenue?: number } | null)?.total_revenue ?? 0); const expenses = Number(expense?.total ?? 0);
 return <div className="mx-auto max-w-[1440px] space-y-6"><PageHeader eyebrow="Analytics" title="Reports" description={`Real gym data · ${from} through ${to} · ${zone}`}/>
  <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border/80 bg-surface p-4"><label className="text-xs text-muted-foreground">Reporting period<select name="period" defaultValue={period} className="mt-1 block h-10 rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground">{(["daily", "weekly", "monthly", "yearly"] as const).map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></label><button className="h-10 rounded-md bg-elevated px-4 text-sm font-semibold">Update report</button></form>
  {failed ? <p role="alert" className="rounded border border-destructive/40 p-4 text-sm text-destructive">One or more reports could not be loaded for this gym.</p> : <>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Membership revenue", membershipRevenue], ["Registration revenue", registrationRevenue], ["Total collected", revenue], ["Expenses", expenses], ["Net income", revenue - expenses], ["Expected revenue", Number(finance?.expected_revenue ?? 0)], ["Outstanding", Number(finance?.outstanding ?? 0)]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border/80 bg-surface p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 font-display text-xl font-semibold">{new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value))}</p></div>)}</div>
   <div className="grid gap-4 xl:grid-cols-2"><BarSeries title="Revenue by day" rows={revenueRows} field="amount" currency={currency}/><BarSeries title="Expenses by day" rows={expenseRows} field="amount" currency={currency}/></div>
   <div className="grid gap-4 xl:grid-cols-3"><CommandCenterCard title="Memberships"><p className="text-sm text-muted-foreground">{report?.memberships?.active ?? 0} active · {report?.memberships?.expiring ?? 0} expiring · {report?.memberships?.expired ?? 0} expired in current snapshot</p></CommandCenterCard><CommandCenterCard title="Attendance"><p className="text-sm text-muted-foreground">{report?.attendance?.total_check_ins ?? 0} check-ins · {report?.attendance?.unique_members ?? 0} members during period</p></CommandCenterCard><CommandCenterCard title="Payments"><p className="text-sm text-muted-foreground">{(report?.payments?.by_method ?? []).map((m: { method: string; payment_count: number; completed_revenue: number }) => `${m.method}: ${m.payment_count}`).join(" · ") || "No payment activity in this period."}</p></CommandCenterCard></div>
  </>}
 </div>;
}
