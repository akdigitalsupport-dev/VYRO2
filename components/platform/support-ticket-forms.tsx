"use client";

import { useActionState } from "react";
import { createSupportTicketAction, updateSupportTicketAction } from "@/app/(platform)/platform/support/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initialFormActionState } from "@/lib/forms";

type GymOption={id:string;name:string};
export function CreateSupportTicketForm({gyms}:{gyms:GymOption[]}){
 const [state,action,pending]=useActionState(createSupportTicketAction,initialFormActionState);
 return <form action={action} className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
  <h2 className="font-display text-sm font-semibold">Create support ticket</h2>
  {state.message?<p role={state.status==="error"?"alert":"status"} className={`rounded-md border p-3 text-sm ${state.status==="error"?"border-destructive/40 bg-destructive/5 text-destructive":"border-positive/40 bg-positive/5 text-positive"}`}>{state.message}</p>:null}
  <div className="grid gap-3 sm:grid-cols-2">
   <div className="grid gap-1.5"><Label htmlFor="ticket-gym">Gym (optional)</Label><select id="ticket-gym" name="gym_id" defaultValue="" className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Platform-wide / unassigned</option>{gyms.map(gym=><option key={gym.id} value={gym.id}>{gym.name}</option>)}</select></div>
   <div className="grid gap-1.5"><Label htmlFor="ticket-priority">Priority</Label><select id="ticket-priority" name="priority" defaultValue="normal" className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
  </div>
  <Field name="subject" label="Subject" required error={state.fieldErrors?.subject}/>
  <div className="grid gap-1.5"><Label htmlFor="ticket-description">Issue description</Label><Textarea id="ticket-description" name="description" rows={4} maxLength={8000} required aria-invalid={Boolean(state.fieldErrors?.description)}/>{state.fieldErrors?.description?<p className="text-xs text-destructive">{state.fieldErrors.description}</p>:null}</div>
  <div className="grid gap-3 sm:grid-cols-2"><Field name="requester_name" label="Requester name" error={state.fieldErrors?.requester_name}/><Field name="requester_email" label="Requester email" type="email" error={state.fieldErrors?.requester_email}/></div>
  <Button type="submit" disabled={pending}>{pending?"Creating…":"Create ticket"}</Button>
 </form>;
}
export function SupportTicketUpdateForm({ticket}:{ticket:{id:string;status:string;internal_notes:string|null;resolution_summary:string|null}}){
 const [state,action,pending]=useActionState(updateSupportTicketAction,initialFormActionState);
 return <form action={action} className="grid min-w-[260px] gap-2 rounded-md border border-border/70 bg-background/35 p-3">
  <input type="hidden" name="ticket_id" value={ticket.id}/>
  {state.message?<p role={state.status==="error"?"alert":"status"} className={`text-xs ${state.status==="error"?"text-destructive":"text-positive"}`}>{state.message}</p>:null}
  <Label htmlFor={`status-${ticket.id}`}>Status</Label>
  <select id={`status-${ticket.id}`} name="status" defaultValue={ticket.status} className="min-h-9 rounded-md border border-input bg-background px-2 py-1 text-xs"><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_on_customer">Waiting on customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
  <Label htmlFor={`internal-${ticket.id}`}>Internal notes</Label>
  <Textarea id={`internal-${ticket.id}`} name="internal_notes" defaultValue={ticket.internal_notes??""} rows={2} maxLength={8000}/>
  <Label htmlFor={`resolution-${ticket.id}`}>Resolution summary</Label>
  <Textarea id={`resolution-${ticket.id}`} name="resolution_summary" defaultValue={ticket.resolution_summary??""} rows={2} maxLength={2000}/>
  <Button type="submit" variant="outline" size="sm" disabled={pending}>{pending?"Saving…":"Save update"}</Button>
 </form>;
}
function Field({name,label,type="text",required=false,error}:{name:string;label:string;type?:string;required?:boolean;error?:string}){
 return <div className="grid min-w-0 gap-1.5"><Label htmlFor={`ticket-${name}`}>{label}</Label><Input id={`ticket-${name}`} name={name} type={type} required={required} maxLength={254} aria-invalid={Boolean(error)}/>{error?<p className="text-xs text-destructive">{error}</p>:null}</div>;
}
