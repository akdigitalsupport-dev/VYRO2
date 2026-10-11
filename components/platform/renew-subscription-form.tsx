"use client";

import { useActionState } from "react";
import { renewPlatformSubscriptionAction } from "@/app/(platform)/platform/revenue/subscriptions-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormActionState } from "@/lib/forms";

type Subscription = {
  id: string;
  billing_period: string;
  expires_on: string;
  gym_name: string;
};

export function RenewSubscriptionForm({ subscription }: { subscription: Subscription }) {
  const [state, action, pending] = useActionState(renewPlatformSubscriptionAction, initialFormActionState);
  const custom = subscription.billing_period === "custom";
  const today = todayInIndia();
  const expiry = subscription.expires_on >= today ? subscription.expires_on : today;

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Start a new paid subscription term for this gym? This creates a separate past-due term. Record and verify its payment before activating it.")) {
          event.preventDefault();
        }
      }}
      className="grid gap-3 rounded-md border border-warning/30 bg-warning/5 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
    >
      <div className="grid gap-2">
        <p className="text-sm font-semibold">Renew / start a new paid term</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Creates a separate subscription record so the previous term and payment history remain intact.
          The new term starts as past due until payment is verified.
        </p>
        <input type="hidden" name="subscription_id" value={subscription.id} />
        {custom ? (
          <div className="grid gap-1.5">
            <Label htmlFor={"renewal-expiry-" + subscription.id}>New term expiry date</Label>
            <Input
              id={"renewal-expiry-" + subscription.id}
              type="date"
              name="renewal_expires_on"
              defaultValue={expiry}
              min={today}
              required
              aria-invalid={Boolean(state.fieldErrors?.renewal_expires_on)}
            />
            {state.fieldErrors?.renewal_expires_on ? <p className="text-xs text-destructive">{state.fieldErrors.renewal_expires_on}</p> : null}
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">Billing period: {humanize(subscription.billing_period)}. The expiry date is calculated automatically.</p>
            <input type="hidden" name="renewal_expires_on" value="" />
          </>
        )}
        {state.message ? (
          <p role={state.status === "error" ? "alert" : "status"} className={"text-xs " + (state.status === "error" ? "text-destructive" : "text-positive")}>
            {state.message}
          </p>
        ) : null}
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Creating term…" : "Start renewal"}
      </Button>
    </form>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function todayInIndia() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return String(values.year) + "-" + String(values.month) + "-" + String(values.day);
}
