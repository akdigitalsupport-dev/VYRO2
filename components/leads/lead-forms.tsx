"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createLeadAction, updateLeadStatusAction } from "@/app/(gym)/gym/leads/actions";
import { initialFormActionState } from "@/lib/forms";

export function LeadCreateForm() {
  const [state, action, pending] = useActionState(createLeadAction, initialFormActionState);
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <div className="grid gap-1.5"><Label htmlFor="lead-name">Name *</Label><Input id="lead-name" name="name" required maxLength={160} aria-invalid={Boolean(state.fieldErrors?.name)} />{state.fieldErrors?.name ? <p role="alert" className="text-xs text-destructive">{state.fieldErrors.name}</p> : null}</div>
    <div className="grid gap-1.5"><Label htmlFor="lead-phone">Phone</Label><Input id="lead-phone" name="phone" type="tel" maxLength={40} /></div>
    <div className="grid gap-1.5"><Label htmlFor="lead-email">Email</Label><Input id="lead-email" name="email" type="email" maxLength={254} aria-invalid={Boolean(state.fieldErrors?.email)} />{state.fieldErrors?.email ? <p role="alert" className="text-xs text-destructive">{state.fieldErrors.email}</p> : null}</div>
    <div className="grid gap-1.5"><Label htmlFor="lead-source">Source</Label><Input id="lead-source" name="source" placeholder="Referral, walk-in, social…" maxLength={80} /></div>
    <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="lead-notes">Notes</Label><Textarea id="lead-notes" name="notes" rows={3} maxLength={1000} /></div>
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add lead"}</Button>{state.message ? <p role={state.status === "error" ? "alert" : "status"} className="text-sm">{state.message}</p> : null}</div>
  </form>;
}

export function LeadStatusForm({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(updateLeadStatusAction, initialFormActionState);
  return <form action={action} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="id" value={id} />
    <Label htmlFor={`lead-status-${id}`} className="sr-only">Lead status</Label>
    <select id={`lead-status-${id}`} name="status" defaultValue={status} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
      {(["new", "contacted", "trial", "converted", "lost"] as const).map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
    </select>
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
    {state.message ? <span role={state.status === "error" ? "alert" : "status"} className="text-xs text-muted-foreground">{state.message}</span> : null}
  </form>;
}
