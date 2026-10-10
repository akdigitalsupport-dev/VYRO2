import type { Metadata } from "next";
import { Building2, CreditCard, HeartPulse, Inbox, Layers3, Wallet, Clock3, ShieldAlert } from "lucide-react";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { QuickActionLink } from "@/components/ui/quick-action-link";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

export default async function PlatformOverviewPage() {
  const supabase = await createServerSupabaseClient();
  const today = dateInIndia(0);
  const sevenDays = dateInIndia(7);
  const monthStart = monthStartInIndia();
  const [
    totalGyms, activeGyms, expiringGyms, suspendedGyms, trialSubscriptions,
    activeSubscriptions, pastDueSubscriptions, expiredSubscriptions, pendingPayments,
    paymentsThisMonth, upcomingExpiry, recentActivity, latestGyms
  ] = await Promise.all([
    supabase.from("gyms").select("id", { count: "exact", head: true }),
    supabase.from("gyms").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("gyms").select("id", { count: "exact", head: true }).eq("status", "expiring"),
    supabase.from("gyms").select("id", { count: "exact", head: true }).eq("status", "suspended"),
    supabase.from("platform_subscriptions").select("id", { count: "exact", head: true }).eq("status", "trial"),
    supabase.from("platform_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("platform_subscriptions").select("id", { count: "exact", head: true }).eq("status", "past_due"),
    supabase.from("platform_subscriptions").select("id", { count: "exact", head: true }).eq("status", "expired"),
    supabase.from("platform_subscription_payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("platform_subscription_payments").select("amount,currency,payment_date").eq("status", "completed").gte("payment_date", monthStart).limit(1000),
    supabase.from("platform_subscriptions").select("id,gym_id,plan_name,status,expires_on,gyms!platform_subscriptions_gym_id_fkey(name)").in("status", ["trial", "active", "past_due"]).gte("expires_on", today).lte("expires_on", sevenDays).order("expires_on", { ascending: true }).limit(10),
    supabase.from("audit_logs").select("id,action,entity_type,created_at,gym_id,gyms!audit_logs_gym_id_fkey(name)").order("created_at", { ascending: false }).limit(6),
    supabase.from("gyms").select("id,name,status,created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  const results = [totalGyms,activeGyms,expiringGyms,suspendedGyms,trialSubscriptions,activeSubscriptions,pastDueSubscriptions,expiredSubscriptions,pendingPayments,paymentsThisMonth,upcomingExpiry,recentActivity,latestGyms];
  const summaryError = results.some(result => result.error);
  const verifiedInr = (paymentsThisMonth.data ?? []).filter(payment => payment.currency.trim() === "INR").reduce((sum,payment) => sum + Number(payment.amount),0);
  const verifiedOtherCurrencies = [...new Set((paymentsThisMonth.data ?? []).filter(payment => payment.currency.trim() !== "INR").map(payment=>payment.currency.trim()))];

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <PageHeader eyebrow="Platform overview" title="Your network at a glance" description="A live view of customer gyms, VYRO subscriptions, verified payment activity, and upcoming trial or subscription expiries." />
      {summaryError ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Some platform summary data could not be loaded. Values that depend on failed queries may be incomplete; refresh or review the relevant page.</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Total gyms" value={n(totalGyms.count)} hint="Customer workspaces"/>
        <StatCard icon={HeartPulse} label="Active gyms" value={n(activeGyms.count)} hint="Workspace status active"/>
        <StatCard icon={Clock3} label="Trial subscriptions" value={n(trialSubscriptions.count)} hint="Currently in free trial"/>
        <StatCard icon={ShieldAlert} label="Past-due subscriptions" value={n(pastDueSubscriptions.count)} hint="Require billing follow-up"/>
        <StatCard icon={Layers3} label="Expiring gyms" value={n(expiringGyms.count)} hint="Workspace status expiring"/>
        <StatCard icon={CreditCard} label="Active subscriptions" value={n(activeSubscriptions.count)} hint="VYRO paid accounts"/>
        <StatCard icon={Wallet} label="Verified revenue this month" value={formatInr(verifiedInr)} hint={verifiedOtherCurrencies.length? `Other currencies are separate: ${verifiedOtherCurrencies.join(", ")}`:"Completed INR payment records only"}/>
        <StatCard icon={Inbox} label="Pending payment records" value={n(pendingPayments.count)} hint="Not counted as revenue"/>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CommandCenterCard title="Trial and subscription expiries — next 7 days">
          {(upcomingExpiry.data??[]).length ? <ul className="divide-y divide-border">{(upcomingExpiry.data??[]).map(item=>{const gym=Array.isArray(item.gyms)?item.gyms[0]:item.gyms;return <li key={item.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-medium">{gym?.name??"Unknown gym"}</p><p className="mt-1 text-xs text-muted-foreground">{item.plan_name} · expires {formatDate(item.expires_on)}</p></div><Badge variant={item.status==="past_due"?"danger":"warning"}>{humanize(item.status)}</Badge></li>})}</ul> : <EmptyState icon={Clock3} title="No upcoming expiries" description="No trial or active subscription expires within the next seven days, based on the saved expiry dates."/>}
          <div className="mt-4 border-t border-border pt-3"><QuickActionLink href="/platform/gyms/trials" label="Review trial accounts" description="See current VYRO trials" icon={Clock3}/></div>
        </CommandCenterCard>
        <CommandCenterCard title="Recent audit activity">
          {recentActivity.error ? <p role="alert" className="text-sm text-muted-foreground">Recent activity could not be loaded.</p> : recentActivity.data?.length ? <ul className="divide-y divide-border">{recentActivity.data.map(event=>{const gym=Array.isArray(event.gyms)?event.gyms[0]:event.gyms;return <li key={event.id} className="flex min-w-0 items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-medium">{event.action}</p><p className="mt-1 text-xs text-muted-foreground">{gym?.name??(event.gym_id?"Gym unavailable":"Platform-wide")} · {event.entity_type}</p></div><time className="shrink-0 text-xs text-muted-foreground" dateTime={event.created_at}>{formatDateTime(event.created_at)}</time></li>})}</ul> : <EmptyState icon={Inbox} title="No audit activity" description="Platform events will appear here as they are recorded."/>}
          <div className="mt-4 border-t border-border pt-3"><QuickActionLink href="/platform/audit" label="Open audit logs" description="Review platform changes" icon={ShieldAlert}/></div>
        </CommandCenterCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CommandCenterCard title="Recently created gyms">
          {latestGyms.data?.length ? <ul className="divide-y divide-border">{latestGyms.data.map(gym=><li key={gym.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="font-medium text-sm">{gym.name}</p><p className="mt-1 text-xs text-muted-foreground">Created {formatDate(gym.created_at)}</p></div><Badge variant={gym.status==="active"?"positive":gym.status==="suspended"?"danger":"warning"}>{humanize(gym.status)}</Badge></li>)}</ul>:<EmptyState icon={Building2} title="No gyms yet" description="Create a customer workspace and start its free trial." action={{label:"Add Gym",href:"/platform/gyms/new"}}/>}
          <div className="mt-4 border-t border-border pt-3"><QuickActionLink href="/platform/gyms" label="Browse all gyms" description="Search all customer workspaces" icon={Building2}/></div>
        </CommandCenterCard>
        <CommandCenterCard title="Quick actions">
          <div className="grid gap-2">
            <QuickActionLink href="/platform/gyms/new" label="Add a gym" description="Create a workspace and start a trial" icon={Building2}/>
            <QuickActionLink href="/platform/plans" label="Manage SaaS plans" description="Configure package pricing" icon={CreditCard}/>
            <QuickActionLink href="/platform/revenue/payments" label="Reconcile payments" description="Review pending VYRO payments" icon={Wallet}/>
            <QuickActionLink href="/platform/support" label="Open support" description="Track customer issues" icon={Inbox}/>
          </div>
        </CommandCenterCard>
      </div>
    </div>
  );
}

function n(value:number|null|undefined){return String(value??0)}
function humanize(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase())}
function formatInr(value:number){return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(value)}
function formatDate(value:string){const d=new Date(`${value}T00:00:00Z`);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeZone:"Asia/Kolkata"}).format(d)}
function formatDateTime(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(d)}
function dateInIndia(addDays:number){const d=new Date(Date.now()+addDays*86400000);const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
function monthStartInIndia(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit"}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return new Date(`${p.year}-${p.month}-01T00:00:00+05:30`).toISOString()}
