import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "System health" };

export default async function PlatformSystemPage() {
  const supabase=await createServerSupabaseClient();
  const {data,error}=await supabase.from("platform_settings").select("id,updated_at").eq("id",1).maybeSingle();
  const envChecks=[
    {label:"Supabase public endpoint",configured:Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),detail:"Required for login and data access."},
    {label:"Supabase publishable / anon key",configured:Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),detail:"Public client key; never a service-role secret."},
    {label:"Supabase service-role key",configured:Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),detail:"Required for secure owner invitations and server-only administrative actions."},
    {label:"Production site URL",configured:Boolean(process.env.NEXT_PUBLIC_SITE_URL),detail:"Used for email invitation redirect URLs."},
    {label:"Scheduled task secret",configured:Boolean(process.env.CRON_SECRET),detail:"Configuration presence only; does not prove the scheduler is running."},
    {label:"Web Push private key",configured:Boolean(process.env.VAPID_PRIVATE_KEY),detail:"Required for server-side Web Push delivery."},
    {label:"Razorpay credentials",configured:Boolean(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET),detail:"No gateway connection is claimed unless both server credentials are configured."},
  ];
  const missing=envChecks.filter(c=>!c.configured);
  return <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
    <PageHeader eyebrow="System" title="System Health" description="Live read checks and configuration-presence checks. This page does not invent uptime percentages or claim external services are reachable solely because keys exist."/>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <article className="rounded-lg border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">Database read check</p><p className={`mt-2 flex items-center gap-2 font-semibold ${error||!data?"text-destructive":"text-positive"}`}>{error||!data?<AlertTriangle className="h-4 w-4"/>:<CheckCircle2 className="h-4 w-4"/>}{error||!data?"Failed":"Passed"}</p><p className="mt-2 text-xs text-muted-foreground">{error?"The platform settings query failed. Check schema and database permissions.":data?`Platform settings row present; last updated ${formatDate(data.updated_at)}.`:"The settings row was not found."}</p></article>
      <article className="rounded-lg border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">App environment</p><p className="mt-2 font-display text-2xl font-semibold">{process.env.VERCEL_ENV??"local / unknown"}</p><p className="mt-2 text-xs text-muted-foreground">Current deployment environment identifier.</p></article>
      <article className="rounded-lg border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">Configuration items missing</p><p className={`mt-2 font-display text-2xl font-semibold ${missing.length?"text-warning":"text-positive"}`}>{missing.length}</p><p className="mt-2 text-xs text-muted-foreground">This is a key-presence check, not an external connectivity test.</p></article>
    </div>
    <CommandCenterCard title="Integration configuration checks">
      <div className="divide-y divide-border">{envChecks.map(check=><div key={check.label} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${check.configured?"border-positive/30 bg-positive/10 text-positive":"border-warning/30 bg-warning/10 text-warning"}`}>{check.configured?<CheckCircle2 className="h-4 w-4"/>:<CircleHelp className="h-4 w-4"/>}</span><div><p className="text-sm font-medium">{check.label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p></div></div><span className={`self-start rounded-full border px-2 py-1 text-xs ${check.configured?"border-positive/30 bg-positive/10 text-positive":"border-warning/30 bg-warning/10 text-warning"}`}>{check.configured?"Configured":"Missing"}</span></div>)}</div>
      <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">Never paste secret values into this dashboard or into chat. Configure missing values in Vercel&apos;s server environment settings, then redeploy. After that, perform real delivery/payment checks to verify integrations.</p>
    </CommandCenterCard>
  </div>;
}
function formatDate(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(d)}
