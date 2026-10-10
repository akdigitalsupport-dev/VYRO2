import Link from "next/link";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function OutstandingDashboard() {
  const supabase = await createServerSupabaseClient();
  const [pastDueResult, pendingResult, gymsResult] = await Promise.all([
    supabase.from("platform_subscriptions")
      .select("id,gym_id,plan_name,amount,currency,expires_on,status")
      .eq("status", "past_due")
      .order("expires_on", { ascending: true }),
    supabase.from("platform_subscription_payments")
      .select("id,subscription_id,gym_id,amount,currency,payment_date,reference,status")
      .eq("status", "pending")
      .order("payment_date", { ascending: true }),
    supabase.from("gyms").select("id,name,owner_name,email"),
  ]);

  const hasError = pastDueResult.error || pendingResult.error || gymsResult.error;
  const pastDue = pastDueResult.data ?? [];
  const pending = pendingResult.data ?? [];
  const gymById = new Map((gymsResult.data ?? []).map((gym) => [gym.id, gym]));
  const pendingInr = pending.filter((p) => p.currency.trim() === "INR").reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <PageHeader eyebrow="Revenue" title="Outstanding" description="Review subscriptions marked past due and pending payment records. A subscription's plan price is not the same as a verified invoice balance." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Past-due subscriptions" value={String(pastDue.length)} />
        <Metric label="Pending payment records" value={String(pending.length)} />
        <Metric label="Pending ledger entries (INR)" value={formatInr(pendingInr)} />
      </div>

      {hasError ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Outstanding records could not be loaded.</p> : null}

      <CommandCenterCard title="Past-due subscriptions">
        {pastDue.length === 0 ? (
          <EmptyState icon={Inbox} title="No past-due subscriptions" description="Subscriptions with a past-due status will appear here when they are recorded." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="py-2 pr-4 font-semibold">Gym</th><th className="py-2 pr-4 font-semibold">Plan price</th><th className="py-2 pr-4 font-semibold">Expiry date</th><th className="py-2 pr-4 font-semibold">Payment history</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pastDue.map((subscription) => {
                  const gym = gymById.get(subscription.gym_id);
                  return <tr key={subscription.id}>
                    <td className="py-3 pr-4"><p className="font-medium">{gym?.name ?? "Unknown gym"}</p><p className="mt-1 text-xs text-muted-foreground">{gym?.owner_name ?? gym?.email ?? "Owner not recorded"}</p></td>
                    <td className="py-3 pr-4 tabular-nums">{formatCurrency(Number(subscription.amount), subscription.currency)}</td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(subscription.expires_on)}</td>
                    <td className="py-3 pr-4"><Link className="text-accent underline-offset-4 hover:underline" href="/platform/revenue/payments">Review payments</Link></td>
                  </tr>;
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">The price above is the configured subscription amount. It is not presented as the precise unpaid balance because the current ledger does not contain a separate invoice balance for each billing period.</p>
          </div>
        )}
      </CommandCenterCard>

      <CommandCenterCard title="Pending payment records">
        {pending.length === 0 ? (
          <EmptyState icon={Inbox} title="No pending payment records" description="New manual payment entries stay pending until receipt is verified in the SaaS Payments ledger." action={{ label: "Open SaaS Payments", href: "/platform/revenue/payments" }} />
        ) : (
          <div className="space-y-0 divide-y divide-border">
            {pending.map((payment) => (
              <div key={payment.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{gymById.get(payment.gym_id)?.name ?? "Unknown gym"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{payment.reference || "No reference recorded"} · {formatDate(payment.payment_date)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium tabular-nums">{formatCurrency(Number(payment.amount), payment.currency)}</span>
                  <Link className="text-sm text-accent underline-offset-4 hover:underline" href="/platform/revenue/payments">Reconcile</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CommandCenterCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="rounded-lg border border-border bg-surface px-4 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p></article>;
}

function formatInr(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.trim(), maximumFractionDigits: 2 }).format(amount);
}

function formatDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(date);
}
