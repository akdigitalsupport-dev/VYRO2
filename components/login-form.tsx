"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/lib/auth/actions";

const initialState: LoginState = {};

export function LoginForm({ configurationMissing }: { configurationMissing: boolean }) {
  const [state, action, pending] = useActionState(signIn, initialState);
  return (
    <form action={action} className="login-form">
      {configurationMissing && <p className="notice" role="status">Add the Supabase URL and publishable key to the server environment to enable sign in.</p>}
      {state.configurationMissing && <p className="notice" role="alert">Supabase is not configured yet. Ask an administrator to complete the setup.</p>}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <label htmlFor="email">Work email</label>
      <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
      <button className="button button-primary login-submit" type="submit" disabled={pending || configurationMissing}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="form-footnote">Access is provisioned by your VYRO administrator.</p>
    </form>
  );
}
