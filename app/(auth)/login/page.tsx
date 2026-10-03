import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const configured = hasSupabaseConfig();
  return <main className="login-page">
    <section className="login-brand-panel">
      <Link className="brand" href="/login"><span className="brand-mark">V</span><span>VYRO</span></Link>
      <div className="login-brand-content">
        <span className="eyebrow">Gym operations, in sync</span>
        <h1>Make room for the work that moves you.</h1>
        <p>Member care, daily operations and business health — clearly in one place.</p>
      </div>
      <div className="login-brand-footer">A calmer way to run your gym.</div>
    </section>
    <section className="login-form-panel">
      <div className="login-card">
        <span className="eyebrow">Welcome back</span>
        <h2>Sign in to VYRO</h2>
        <p>Use the account provisioned for your workspace.</p>
        {reason === "access" && <p className="form-error" role="alert">Your account does not have access to that workspace.</p>}
        {reason === "invite" && <p className="form-error" role="alert">That invitation could not be verified. Ask your VYRO administrator to send a new invite.</p>}
        <LoginForm configurationMissing={!configured} />
      </div>
    </section>
  </main>;
}
