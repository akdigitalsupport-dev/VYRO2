"use client";

import { useActionState } from "react";
import { markPlatformPaymentReceivedAction } from "@/app/(platform)/platform/revenue/actions";
import { Button } from "@/components/ui/button";
import { initialFormActionState } from "@/lib/forms";

export function PaymentReconciliationForm({ paymentId }: { paymentId: string }) {
  const [state, action, pending] = useActionState(markPlatformPaymentReceivedAction, initialFormActionState);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Confirm that the money was actually received and verified. This will mark the pending payment as completed and include it in revenue totals.")) event.preventDefault();
      }}
      className="grid justify-items-start gap-1"
    >
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="confirmed" value="yes" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving…" : "Verify receipt & mark completed"}</Button>
      {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`max-w-xs text-xs ${state.status === "error" ? "text-destructive" : "text-positive"}`}>{state.message}</p> : null}
    </form>
  );
}
