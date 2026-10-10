"use client";

import { useActionState } from "react";
import { createPendingPlatformPaymentAction } from "@/app/(platform)/platform/revenue/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormActionState } from "@/lib/forms";

type SubscriptionOption = {
  id: string;
  plan_name: string;
  amount: number | string;
  currency: string;
  status: string;
  gym_name: string;
};

export function CreatePendingPaymentForm({ subscriptions }: { subscriptions: SubscriptionOption[] }) {
  const [state, action, pending] = useActionState(createPendingPlatformPaymentAction, initialFormActionState);

  if (!subscriptions.length) {
    return <p className="text-sm text-muted-foreground">There are no active, past-due or suspended paid subscriptions to record against. Free trials do not create payment entries.</p>;
  }

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`sm:col-span-2 rounded-md border p-3 text-sm ${state.status === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-positive/40 bg-positive/5 text-positive"}`}>{state.message}</p> : null}
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="subscription_id">Gym subscription</Label>
        <select id="subscription_id" name="subscription_id" required defaultValue="" className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="" disabled>Select a paid subscription</option>
          {subscriptions.map((item) => (
            <option key={item.id} value={item.id}>{item.gym_name} — {item.plan_name} ({item.status})</option>
          ))}
        </select>
        {state.fieldErrors?.subscription_id ? <p className="text-xs text-destructive">{state.fieldErrors.subscription_id}</p> : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="amount">Amount received / expected (₹)</Label>
        <Input id="amount" name="amount" type="number" min="0.01" max="9999999999.99" step="0.01" required aria-invalid={Boolean(state.fieldErrors?.amount)} />
        {state.fieldErrors?.amount ? <p className="text-xs text-destructive">{state.fieldErrors.amount}</p> : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="reference">Payment reference (optional)</Label>
        <Input id="reference" name="reference" maxLength={200} placeholder="UPI reference / receipt number" aria-invalid={Boolean(state.fieldErrors?.reference)} />
        {state.fieldErrors?.reference ? <p className="text-xs text-destructive">{state.fieldErrors.reference}</p> : null}
      </div>
      <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">This creates a pending ledger record only. No payment gateway is connected, and VYRO will not mark it paid until you verify receipt in the ledger.</p>
      <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create pending payment"}</Button></div>
    </form>
  );
}
