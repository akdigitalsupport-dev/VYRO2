"use client";
import { useActionState } from "react";
import { saveNotificationPreferencesAction } from "@/app/(gym)/gym/settings/actions";
import { Button } from "@/components/ui/button";
import type { FormActionState } from "@/lib/forms";
const initial: FormActionState = { status: "idle", message: "" };
const events = [["membership_expiring", "Membership expiring"], ["membership_expiry_reminder", "Expiry reminder"], ["membership_expired", "Membership expired"], ["member_created", "New member"], ["membership_created", "Membership assigned or renewed"], ["payment_recorded", "Payment received"], ["payment_refunded", "Payment refunded"], ["expense_recorded", "Expense recorded"]] as const;
export function NotificationPreferencesForm({ current }: { current: Record<string, boolean> }) {
 const [state, action, pending] = useActionState(saveNotificationPreferencesAction, initial);
 return <form action={action} className="space-y-3">{events.map(([key, label]) => <label key={key} className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm"><span>{label}</span><input type="checkbox" name={key} defaultChecked={current[key] ?? true} className="h-4 w-4 accent-[var(--accent)]"/></label>)}<Button disabled={pending}>{pending ? "Saving…" : "Save preferences"}</Button>{state.message ? <p role={state.status === "error" ? "alert" : "status"} className="text-sm">{state.message}</p> : null}</form>;
}
