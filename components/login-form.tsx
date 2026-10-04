"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/lib/auth/actions";
import { Alert, Button, Input } from "@/components/ui";

const initialState: LoginState = {};

export function LoginForm({ configurationMissing }: { configurationMissing: boolean }) {
  const [state, action, pending] = useActionState(signIn, initialState);
  return (
    <form action={action} className="login-form">
      {configurationMissing && <Alert>Add the Supabase URL and publishable key to the server environment to enable sign in.</Alert>}
      {state.configurationMissing && <Alert>Supabase is not configured yet. Ask an administrator to complete the setup.</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <label htmlFor="email">Work email</label>
      <Input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
      <label htmlFor="password">Password</label>
      <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
      <Button variant="primary" className="login-submit" type="submit" disabled={pending || configurationMissing}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="form-footnote">Access is provisioned by your VYRO administrator.</p>
    </form>
  );
}
