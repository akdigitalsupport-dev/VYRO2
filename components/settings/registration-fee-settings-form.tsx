"use client";

import { useActionState } from "react";
import { saveRegistrationFeeSettingsAction } from "@/app/(gym)/gym/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormActionState } from "@/lib/forms";

const initial: FormActionState = { status: "idle", message: "" };

export function RegistrationFeeSettingsForm({ settings }: { settings: { amount: number | string; enabled: boolean } }) {
  const [state, action, pending] = useActionState(saveRegistrationFeeSettingsAction, initial);
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <div className="grid gap-1.5">
      <Label htmlFor="registration-fee-amount">First-time registration fee (₹)</Label>
      <Input id="registration-fee-amount" name="registration_fee_amount" type="number" min="0" max="9999999999.99" step="0.01" defaultValue={settings.amount} required />
      <p className="text-xs text-muted-foreground">Saved as an independent payment snapshot for each new member.</p>
    </div>
    <label className="flex items-center gap-2 self-center text-sm">
      <input type="checkbox" name="registration_fee_enabled" defaultChecked={settings.enabled} />
      Charge on first-time member registration
    </label>
    <div className="sm:col-span-2">
      <Button disabled={pending}>{pending ? "Saving…" : "Save registration fee"}</Button>
      {state.message ? <p role={state.status === "error" ? "alert" : "status"} className="mt-2 text-sm">{state.message}</p> : null}
    </div>
  </form>;
}
