import { CreditCard, Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { CreatePendingPaymentForm } from "@/components/platform/create-pending-payment-form";
import { PaymentReconciliationForm } from "@/components/platform/payment-reconciliation-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PlatformPaymentsDashboard() {
  const supabase = await createServerSupabaseClient();
  const [paymentsResult, subscriptionsResult, gymsResult] = await Promise.all([
    supabase
      .from("platform_subscription_payments")
      .select("id,subscription_id,gym_id,amount,currency,payment_date,reference,status,provider_name,provider_reference")
      .order("payment_date", { ascending: false })
      .limit(250),
    supabase
      .from("platform_subscriptions")
      .select("id,gym_id,plan_name,amount,currency,status")
      .order("created_at", { ascending: false }),
    supabase.from("gyms").select("id,name,owner_name,email"),
  ]);

  const loadError = paymentsResult.error || subscriptionsResult.error || gymsResult.error;
  const payments = paymentsResult.data ?? [];
  const subscriptions = subscriptionsResult.data ?? [];
  const gyms = gymsResult.data ?? [];
  const subscriptionById = new Map(subscriptions.map((subscription) => [subscription.id, subscription]));
  const gymById = new Map(gyms.map((gym) => [gym.id, gym]));
  const paymentRows = payments.map((payment) => ({
    ...payment,
    subscription: subscriptionById.get(payment.subscription_id),
    gym: gymById.get(payment.gym_id),
  }));
  const pendingCount = payments.filter((payment) => payment.status === "pending").length;
  const completedCount = payments.filter((payment) => payment.status === "completed").length;
  const completedInr = payments
    .filter((payment) => payment.status === "completed" && payment.currency.trim() === "INR")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const paymentOptions = subscriptions
    .filter((subscription) => ["active", "past_due", "suspended"].includes(subscription.status) && Number(subscription.amount) > 0)
    .map((subscription) => ({
      id: subscription.id,
      plan_name: subscription.plan_name,
      amount: subscription.amount,
      currency: subscription.currency,
      status: subscription.status,
      gym_name: gymById.get(subscription.gym_id)?.name ?? "Unknown gym",
    }));

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <PageHeader eyebrow="Revenue" title="SaaS Payments" description="VYRO subscription payment ledger. Records start pending; completed revenue counts only after receipt is verified. Razorpay is not connected." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Payment records" value={String(payments.length)} />
        <Metric label="Pending reconciliation" value={String(pendingCount)} />
        <Metric label="Completed volume (INR)" value={formatInr(completedInr)} hint={`${completedCount} completed records across currencies`} />
      </div>

      <CommandCenterCard title="Record a pending payment">
        <CreatePendingPaymentForm subscriptions={paymentOptions} />
      </CommandCenterCard>

      {loadError ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Payment ledger data could not be loaded. Refresh the page or review Platform Admin access.</p>
      ) : paymentRows.length === 0 ? (
        <EmptyState icon={Inbox} title="No payment records yet" description="Create a pending record after identifying the SaaS subscription. Do not use this form to simulate a successful payment." />
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-[0_10px_28px_rgba(0,0,0,0.1)]">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="font-display text-sm font-semibold">Payment ledger</h2>
            <span className="text-xs text-muted-foreground">Latest {paymentRows.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-background/55 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Gym / plan</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Reconcile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paymentRows.map((payment) => (
                  <tr key={payment.id} className="align-top hover:bg-background/35">
                    <td className="px-4 py-3">
                      <p className="font-medium">{payment.gym?.name ?? "Unknown gym"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{payment.subscription?.plan_name ?? "Subscription unavailable"}</p>
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums">{formatCurrency(Number(payment.amount), payment.currency)}</td>
                    <td className="px-4 py-3"><Status status={payment.status} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(payment.payment_date)}</td>
                    <td className="max-w-52 break-all px-4 py-3 text-xs text-muted-foreground">{payment.reference || payment.provider_reference || "—"}</td>
                    <td className="px-4 py-3">
                      {payment.status === "pending" ? <PaymentReconciliationForm paymentId={payment.id} /> : <span className="text-xs text-muted-foreground">{payment.status === "completed" ? "Receipt confirmed" : "No action"}</span>}
                    </td>
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

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <article className="rounded-lg border border-border bg-surface px-4 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>{hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}</article>;
}

function Status({ status }: { status: string }) {
  const color = status === "completed"
    ? "border-positive/30 bg-positive/10 text-positive"
    : status === "pending"
      ? "border-warning/30 bg-warning/10 text-warning"
      : status === "refunded"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-background text-muted-foreground";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${color}`}>{status.replaceAll("_", " ")}</span>;
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.trim(), maximumFractionDigits: 2 }).format(amount);
}

function formatInr(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date);
}
