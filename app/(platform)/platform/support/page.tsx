import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateSupportTicketForm, SupportTicketUpdateForm } from "@/components/platform/support-ticket-forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Support" };

export default async function PlatformSupportPage() {
  const supabase=await createServerSupabaseClient();
  const [ticketsResult,gymsResult]=await Promise.all([
    supabase.from("platform_support_tickets").select("id,gym_id,subject,description,requester_name,requester_email,priority,status,internal_notes,resolution_summary,created_at,updated_at,resolved_at,gyms!platform_support_tickets_gym_id_fkey(name)").order("created_at",{ascending:false}).limit(100),
    supabase.from("gyms").select("id,name").order("name",{ascending:true})
  ]);
  const tableMissing=Boolean(ticketsResult.error);
  const tickets=ticketsResult.data??[];
  const gyms=gymsResult.data??[];
  return <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
    <PageHeader eyebrow="Support" title="Support" description="Track gym-owner requests, assign priority, manage status and maintain internal notes. Tickets and notes are restricted to Platform Owners."/>
    {gymsResult.error?<p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Gym options could not be loaded. You can still create an unassigned platform-wide ticket.</p>:null}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {tableMissing?<div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-warning">Support-ticket storage needs the reviewed migration installed in this database. No ticket data has been fabricated.</div>:<CreateSupportTicketForm gyms={gyms}/>}
      <CommandCenterCard title="Ticket queue">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Open" value={tickets.filter(t=>t.status==="open").length}/>
          <Metric label="In progress" value={tickets.filter(t=>t.status==="in_progress").length}/>
          <Metric label="Waiting" value={tickets.filter(t=>t.status==="waiting_on_customer").length}/>
          <Metric label="Urgent" value={tickets.filter(t=>t.priority==="urgent"&& !["resolved","closed"].includes(t.status)).length}/>
          <Metric label="Resolved" value={tickets.filter(t=>t.status==="resolved").length}/>
          <Metric label="Closed" value={tickets.filter(t=>t.status==="closed").length}/>
        </div>
      </CommandCenterCard>
    </div>
    <CommandCenterCard title="Recent tickets">
      {tableMissing?<EmptyState icon={Inbox} title="Ticket table is not installed here" description="The support-ticket migration has been added to the implementation branch and staging database. It has not been applied to production."/>:tickets.length===0?<EmptyState icon={Inbox} title="No support tickets" description="Create a ticket to track a customer gym issue."/>:
      <div className="space-y-4">{tickets.map(ticket=>{const gym=Array.isArray(ticket.gyms)?ticket.gyms[0]:ticket.gyms;return <article key={ticket.id} className="grid gap-4 rounded-lg border border-border/80 bg-background/25 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
        <div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-xs ${ticket.priority==="urgent"?"border-destructive/30 bg-destructive/10 text-destructive":ticket.priority==="high"?"border-warning/30 bg-warning/10 text-warning":"border-border bg-background text-muted-foreground"}`}>{ticket.priority}</span><span className="rounded-full border border-border px-2 py-1 text-xs">{humanize(ticket.status)}</span></div><h3 className="font-display text-sm font-semibold">{ticket.subject}</h3><p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{ticket.description}</p><p className="text-xs text-muted-foreground">{gym?.name??"Platform-wide"} · {ticket.requester_name??"Requester not recorded"} {ticket.requester_email?`· ${ticket.requester_email}`:""}</p><p className="text-xs text-muted-foreground">Opened {formatDate(ticket.created_at)}{ticket.resolved_at?` · Resolved ${formatDate(ticket.resolved_at)}`:""}</p></div>
        <SupportTicketUpdateForm ticket={ticket}/>
      </article>})}</div>}
    </CommandCenterCard>
  </div>;
}
function Metric({label,value}:{label:string;value:number}){return <article className="rounded-md border border-border/80 bg-background/40 px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p></article>}
function humanize(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase())}
function formatDate(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(d)}
