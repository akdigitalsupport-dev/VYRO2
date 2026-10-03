import { redirect } from "next/navigation";
import { setInitialPassword } from "@/lib/auth/actions";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [params] = await Promise.all([searchParams]);
  if (!hasSupabaseConfig()) redirect("/login?reason=configuration");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=invite");
  return <main className="login-page">
    <section className="login-brand-panel"><div className="brand"><span className="brand-mark">V</span><span>VYRO</span></div><div className="login-brand-content"><span className="eyebrow">Secure your workspace</span><h1>Make this account yours.</h1><p>Choose a strong password to finish setting up your VYRO account.</p></div><div className="login-brand-footer">A calmer way to run your gym.</div></section>
    <section className="login-form-panel"><div className="login-card"><span className="eyebrow">First sign-in</span><h2>Set your password</h2><p>Use at least 12 characters.</p>
      {params.error && <p className="form-error" role="alert">{params.error === "validation" ? "Enter matching passwords with at least 12 characters." : "Your password could not be saved. Try again."}</p>}
      <form action={setInitialPassword} className="login-form"><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /><label htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /><button className="button button-primary login-submit" type="submit">Save password</button></form>
    </div></section>
  </main>;
}
