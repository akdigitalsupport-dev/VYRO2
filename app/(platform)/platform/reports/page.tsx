import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { EmptyState } from "@/components/ui/empty-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Platform reports" };

export default async function PlatformReportsPage() {
  const supabase = await createServerSupabaseClient();
  const since = new Date();
  since.setDate(1);
  since.setHours(0,0,0,0);
  const [
    gyms,totalGyms,activeGyms,trialGyms,suspendedGyms,
    memberships,subscriptions,completedPayments,pendingPayments,pastDue,
    recentGymCreated,recentSubscriptions
  ] = await Promise.all([
    supabase.from("gyms").select("id,name,status,created_at").order("created_at",{ascending:false}).limit(10),
    supabase.from("gyms").select("id",{count:"exact",head:true}),
    supabase.from("gyms").select("id",{count:"exact",head:true}).eq("status","active"),
    supabase.from("platform_subscriptions").select("id",{count:"exact",head:true}).eq("status","trial"),
    supabase.from("gyms").select("id",{count:"exact",head:true}).eq("status","suspended"),
    supabase.from("gym_user_memberships").select("gym_id",{count:"exact",head:true}).eq("role","gym_admin"),
    supabase.from("platform_subscriptions").select("id",{count:"exact",head:true}),
    supabase.from("platform_subscription_payments").select("amount,currency,payment_date").eq("status","completed").gte("payment_date",since.toISOString()).limit(1000),
    supabase.from("platform_subscription_payments").select("id",{count:"exact",head:true}).eq("status","pending"),
    supabase.from("platform_subscriptions").select("id",{count:"exact",head:true}).eq("status","past_due"),
    supabase.from("gyms").select("id",{count:"exact",head:true}).gte("created_at",since.toISOString()),
    supabase.from("platform_subscriptions").select("id",{count:"exact",head:true}).gte("created_at",since.toISOString()),
  ]);
  const error=gyms.error||totalGyms.error||activeGyms.error||trialGyms.error||suspendedGyms.error||memberships.error||subscriptions.error||completedPayments.error||pendingPayments.error||pastDue.error||recentGymCreated.error||recentSubscriptions.error;
  const completedInr=(completedPayments.data??[]).filter(p=>p.currency.trim()==="INR").reduce((sum,p)=>sum+Number(p.amount),0);
  const completedOtherCurrencies=(completedPayments.data??[]).filter(p=>p.currency.trim()!=="INR").reduce((set,p)=>set.add(p.currency.trim()),new Set<string>());

  return <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
    <PageHeader eyebrow="Reports" title="Platform Reports" description="Tenant growth, subscription states and VYRO payment-ledger activity. Pending payments are excluded from revenue totals; amounts in other currencies are not converted to INR."/>
    {error?<p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">One or more report queries failed. Verify access and schema before relying on these totals.</p>:null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Total gyms" value={n(totalGyms.count)} hint="All customer workspaces"/>
      <Metric label="Active gyms" value={n(activeGyms.count)} hint="Gym status marked active"/>
      <Metric label="Trial subscriptions" value={n(trialGyms.count)} hint="Current trial records"/>
      <Metric label="Suspended gyms" value={n(suspendedGyms.count)} hint="Workspace status suspended"/>
      <Metric label="Gym admin memberships" value={n(memberships.count)} hint="Assigned owner memberships"/>
      <Metric label="SaaS subscriptions" value={n(subscriptions.count)} hint="All subscription states"/>
      <Metric label="Past due" value={n(pastDue.count)} hint="Subscriptions marked past due"/>
      <Metric label="Pending payments" value={n(pendingPayments.count)} hint="Not counted as revenue"/>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <CommandCenterCard title="Payment ledger this month">
        <p className="font-display text-3xl font-semibold tabular-nums">{formatInr(completedInr)}</p>
        <p className="mt-2 text-sm text-muted-foreground">Completed INR records since the start of this month. No conversion is applied to other currencies{completedOtherCurrencies.size? `; other currencies: ${[...completedOtherCurrencies].join(", ")}.`:"."}</p>
        <p className="mt-3 text-xs text-muted-foreground">The report reads the VYRO SaaS ledger, not gym members&apos; payments.</p>
        <Link className="mt-3 inline-block text-sm text-accent underline-offset-4 hover:underline" href="/platform/revenue/payments">Open SaaS payment ledger</Link>
      </CommandCenterCard>
      <CommandCenterCard title="This month's platform activity">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Gyms created" value={n(recentGymCreated.count)} hint="Since month start"/>
          <Metric label="Subscriptions created" value={n(recentSubscriptions.count)} hint="Since month start"/>
        </div>
      </CommandCenterCard>
    </div>
    <CommandCenterCard title="Recently created gyms">
      {(gyms.data??[]).length===0?<EmptyState icon={Building2} title="No gyms recorded" description="New customer workspaces will appear here when provisioned." action={{label:"Add Gym",href:"/platform/gyms/new"}}/>:
      <div className="divide-y divide-border">{(gyms.data??[]).map(gym=><div key={gym.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="font-medium">{gym.name}</p><p className="mt-1 text-xs text-muted-foreground">Created {formatDate(gym.created_at)}</p></div><span className="rounded-full border border-border px-2 py-1 text-xs">{gym.status}</span></div>)}</div>}
    </CommandCenterCard>
  </div>;
}

function Metric({label,value,hint}:{label:string;value:string;hint?:string}){return <article className="rounded-lg border border-border bg-surface px-4 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>{hint?<p className="mt-1 text-xs text-muted-foreground">{hint}</p>:null}</article>}
function n(value:number|null|undefined){return String(value??0)}
function formatInr(value:number){return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(value)}
function formatDate(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeZone:"Asia/Kolkata"}).format(d)}
