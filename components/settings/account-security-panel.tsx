"use client";

import { useActionState } from "react";
import { changeAccountPasswordAction, requestAccountEmailChangeAction } from "@/lib/account-security/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormActionState } from "@/lib/forms";

export function AccountSecurityPanel({ currentEmail }: { currentEmail: string | null }) {
  const [emailState, emailAction, emailPending] = useActionState(requestAccountEmailChangeAction, initialFormActionState);
  const [passwordState, passwordAction, passwordPending] = useActionState(changeAccountPasswordAction, initialFormActionState);
  return <section className="grid gap-6 rounded-lg border border-border bg-surface p-4 sm:p-6">
    <div><h2 className="font-display text-base font-semibold">Account security</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Manage the email and password for your signed-in account. Password changes keep this session active.</p></div>
    <form action={emailAction} className="grid gap-3">
      <h3 className="text-sm font-semibold">Email address</h3>
      <p className="text-sm text-muted-foreground">Current email: {currentEmail || "Unavailable"}. A change takes effect after you confirm it from the email instructions.</p>
      {emailState.message ? <p role={emailState.status === "error" ? "alert" : "status"} className={messageClass(emailState.status)}>{emailState.message}</p> : null}
      <div className="grid gap-1.5"><Label htmlFor="account-new-email">New email</Label><Input id="account-new-email" name="email" type="email" autoComplete="email" maxLength={254} required aria-invalid={Boolean(emailState.fieldErrors?.email)}/>{emailState.fieldErrors?.email ? <p className="text-xs text-destructive">{emailState.fieldErrors.email}</p> : null}</div>
      <Button type="submit" disabled={emailPending}>{emailPending ? "Requesting…" : "Request email change"}</Button>
      <p className="text-xs leading-5 text-muted-foreground">If email changes are unavailable, check Supabase Auth email change and confirmation settings. Password change works independently.</p>
    </form>
    <form action={passwordAction} className="grid gap-3 border-t border-border pt-5">
      <h3 className="text-sm font-semibold">Password</h3>
      {passwordState.message ? <p role={passwordState.status === "error" ? "alert" : "status"} className={messageClass(passwordState.status)}>{passwordState.message}</p> : null}
      <PasswordField id="account-new-password" name="password" label="New password" autoComplete="new-password" error={passwordState.fieldErrors?.password}/>
      <PasswordField id="account-confirm-password" name="confirm" label="Confirm new password" autoComplete="new-password" error={passwordState.fieldErrors?.confirm}/>
      <p className="text-xs text-muted-foreground">Use 12 to 128 characters.</p>
      <Button type="submit" disabled={passwordPending}>{passwordPending ? "Changing…" : "Change password"}</Button>
    </form>
  </section>;
}

function PasswordField({ id, name, label, autoComplete, error }: { id: string; name: string; label: string; autoComplete: "new-password"; error?: string }) {
  return <div className="grid gap-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} type="password" autoComplete={autoComplete} minLength={12} maxLength={128} required aria-invalid={Boolean(error)}/>{error ? <p className="text-xs text-destructive">{error}</p> : null}</div>;
}

function messageClass(status: "idle" | "error" | "success") {
  return `rounded-md border p-3 text-sm ${status === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-positive/40 bg-positive/5 text-positive"}`;
}
