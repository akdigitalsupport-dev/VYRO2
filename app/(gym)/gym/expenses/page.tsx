import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { ExpenseEditor } from "@/components/expenses/expense-editor";
import { ExpenseRows } from "@/components/expenses/expense-rows";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Expenses" };
type Search = { from?: string; to?: string; category?: string; q?: string };
function dateInZone(zone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { gymId } = await requireGymAdminContext();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: settings } = await supabase.from("gym_settings").select("timezone, currency").eq("gym_id", gymId).maybeSingle();
  const today = dateInZone(settings?.timezone ?? "Asia/Kolkata");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") ? params.from! : today.slice(0, 8) + "01";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "") ? params.to! : today;
  const category = ["rent", "electricity", "equipment", "maintenance", "salary", "marketing", "other"].includes(params.category ?? "") ? params.category! : "";
  let query = supabase.from("gym_expenses").select("id, expense_date, category, amount, description, reference, notes").eq("gym_id", gymId).is("archived_at", null).gte("expense_date", from).lte("expense_date", to).order("expense_date", { ascending: false }).limit(500);
  if (category) query = query.eq("category", category);
  const term = (params.q ?? "").trim().slice(0, 80).replace(/[%_]/g, "");
  if (term) query = query.ilike("description", `%${term}%`);
  const [{ data: rows, error }, { data: report, error: reportError }] = await Promise.all([
    query,
    supabase.rpc("get_gym_expense_report", { p_from: from, p_to: to }),
  ]);
  return <div className="mx-auto max-w-[1440px] space-y-6">
    <PageHeader eyebrow="Operations" title="Expenses" description="Record and review gym operating costs. Expense totals also feed the dashboard and reports." />
    <CommandCenterCard title="Add expense"><ExpenseEditor today={today} /></CommandCenterCard>
    <CommandCenterCard title="Expense activity">
      <form className="mb-4 grid gap-3 rounded-lg border border-border/70 bg-background/40 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-muted-foreground">From<input className="mt-1 h-10 w-full rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground" type="date" name="from" defaultValue={from} /></label>
        <label className="text-xs text-muted-foreground">To<input className="mt-1 h-10 w-full rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground" type="date" name="to" defaultValue={to} /></label>
        <label className="text-xs text-muted-foreground">Category<select name="category" defaultValue={category} className="mt-1 h-10 w-full rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground"><option value="">All categories</option>{["rent", "electricity", "equipment", "maintenance", "salary", "marketing", "other"].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">Description<input className="mt-1 h-10 w-full rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground" name="q" maxLength={80} defaultValue={params.q} /></label>
        <button className="h-10 self-end rounded-md bg-elevated px-4 text-sm font-semibold hover:bg-[#242d27]">Filter</button>
      </form>
      {error || reportError ? <p role="alert" className="text-sm text-destructive">Expense records could not be loaded.</p> : <>
        <div className="mb-4 flex flex-wrap gap-5 rounded-md bg-elevated/50 p-3 text-sm"><span>{Number(report?.count ?? 0)} expenses</span><strong>{settings?.currency ?? "INR"} {Number(report?.total ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} total</strong></div>
        <ExpenseRows rows={rows ?? []} currency={settings?.currency ?? "INR"} />
      </>}
    </CommandCenterCard>
  </div>;
}
