import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit logs" };

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const supabase = await createServerSupabaseClient();
  let query = supabase.from("audit_logs")
    .select("id,actor_user_id,gym_id,action,entity_type,entity_id,metadata,created_at,gyms!audit_logs_gym_id_fkey(name)")
    .order("created_at", { ascending: false })
    .limit(250);
  if (q.trim()) query = query.ilike("action", `%${q.trim().replaceAll("%","\\%").replaceAll("_","\\_").slice(0,100)}%`);
  const { data, error } = await query;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <PageHeader eyebrow="System" title="Audit Logs" description="Recent platform and tenant-significant events. Audit records are read-only here; this screen does not rewrite history." />
      <form method="get" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:flex-row">
        <label htmlFor="q" className="sr-only">Filter by action</label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Filter action, e.g. subscription.created" className="min-h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
        <button className="min-h-10 rounded-md border border-border bg-elevated px-4 py-2 text-sm font-semibold" type="submit">Filter</button>
      </form>
      {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Audit logs could not be loaded. Confirm Platform Owner access and the live audit-log schema.</p>
      : !data?.length ? <EmptyState icon={Inbox} title="No matching audit events" description={q?"Try a different action filter.":"Recorded gym, billing and settings changes will appear here."}/>
      : <section className="overflow-hidden rounded-lg border border-border bg-surface"><div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">Latest {data.length} events{q? ` matching “${q}”`:""}</div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-background/55 text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Entity</th><th className="px-4 py-3">Gym</th><th className="px-4 py-3">Actor ID</th><th className="px-4 py-3">When</th></tr></thead><tbody className="divide-y divide-border">{data.map(event=>{const gym=Array.isArray(event.gyms)?event.gyms[0]:event.gyms;return <tr key={event.id} className="align-top hover:bg-background/35"><td className="px-4 py-3"><p className="font-medium">{event.action}</p>{event.entity_id?<p className="mt-1 max-w-64 break-all text-xs text-muted-foreground">{event.entity_id}</p>:null}</td><td className="px-4 py-3"><p>{event.entity_type}</p><MetadataLine value={event.metadata}/></td><td className="px-4 py-3 text-xs">{gym?.name??(event.gym_id?"Gym unavailable":"Platform-wide")}</td><td className="px-4 py-3 text-xs text-muted-foreground">{event.actor_user_id??"System"}</td><td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(event.created_at)}</td></tr>})}</tbody></table></div></section>}
    </div>
  );
}

function MetadataLine({value}:{value:unknown}){
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).length===0) return null;
  return <details className="mt-1 max-w-sm"><summary className="cursor-pointer text-xs text-accent">Details</summary><pre className="mt-2 max-w-sm overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-[11px] text-muted-foreground">{JSON.stringify(value,null,2)}</pre></details>;
}
function formatDate(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?"—":new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(date);}
