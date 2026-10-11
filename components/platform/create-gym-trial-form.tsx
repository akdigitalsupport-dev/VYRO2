"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createGymTrialAction } from "@/app/(platform)/platform/gyms/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initialFormActionState } from "@/lib/forms";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export function CreateGymTrialForm() {
  const [state, action, pending] = useActionState(createGymTrialAction, initialFormActionState);

  return (
    <form action={action} className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <div className="space-y-1">
        <h2 className="font-display text-base font-semibold">Gym and owner details</h2>
        <p className="text-sm leading-6 text-muted-foreground">A new owner receives an email invitation to finish account setup. This form never sets or emails a password.</p>
      </div>

      {state.message ? (
        <div
          role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error"
            ? "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            : "rounded-md border border-positive/40 bg-positive/5 p-3 text-sm text-positive"}
        >
          <p>{state.message}</p>
          {state.status === "success" && state.recordId ? (
            <p className="mt-2"><Link className="underline underline-offset-4" href="/platform/gyms">Return to All Gyms</Link></p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="gym_name" label="Gym name" required error={state.fieldErrors?.gym_name} />
        <Field name="owner_name" label="Owner name" required error={state.fieldErrors?.owner_name} />
        <Field name="owner_email" label="Owner email" type="email" required error={state.fieldErrors?.owner_email} />
        <Field name="owner_phone" label="Owner phone" type="tel" error={state.fieldErrors?.owner_phone} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="address_line">Street address</Label>
        <Textarea id="address_line" name="address_line" maxLength={500} placeholder="Building, street, locality" aria-invalid={Boolean(state.fieldErrors?.address_line)} />
        {state.fieldErrors?.address_line ? <p className="text-xs text-destructive">{state.fieldErrors.address_line}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="city" label="City" error={state.fieldErrors?.city} />
        <Field name="state" label="State" error={state.fieldErrors?.state} />
        <Field name="country" label="Country" defaultValue="India" required error={state.fieldErrors?.country} />
      </div>

      <div className="border-t border-border/70 pt-5">
        <h2 className="font-display text-base font-semibold">Free trial</h2>
        <p className="mt-1 text-sm text-muted-foreground">The gym workspace is created with a trial subscription. Trial duration can be 1–90 days; you can review its status from the Trials section.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="trial_days">Trial duration (days)</Label>
            <Input id="trial_days" name="trial_days" type="number" min={1} max={90} step={1} defaultValue={14} required aria-invalid={Boolean(state.fieldErrors?.trial_days)} />
            {state.fieldErrors?.trial_days ? <p className="text-xs text-destructive">{state.fieldErrors.trial_days}</p> : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="trial_start">Start date</Label>
            <Input id="trial_start" type="text" value={today} readOnly aria-readonly="true" />
            <p className="text-xs text-muted-foreground">Starts today in Asia/Kolkata.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-lg text-xs leading-5 text-muted-foreground">Creating a gym also creates its default settings, links the invited owner to that gym and writes audit events in a single database transaction.</p>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating trial…" : "Create gym and start trial"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  error?: string;
}) {
  const id = name;
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type={type} required={required} defaultValue={defaultValue} maxLength={254} aria-invalid={Boolean(error)} />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
