"use client";

import { useActionState } from "react";
import { updateGymWorkspaceStatusAction } from "@/app/(platform)/platform/gyms/actions";
import { Button } from "@/components/ui/button";
import { initialFormActionState } from "@/lib/forms";

export function GymStatusControl({gymId,status}:{gymId:string;status:string}){
 const [state,action,pending]=useActionState(updateGymWorkspaceStatusAction,initialFormActionState);
 const next=status==="suspended"?"active":"suspended";
 const label=next==="suspended"?"Suspend":"Set active";
 return <form action={action} onSubmit={event=>{
   const message=next==="suspended"
    ?"Suspend this gym? Workspace access will be blocked and its current trial/paid subscription will be suspended where permitted. This does not delete data."
    :"Set the workspace status to active? Access remains blocked if its latest subscription is still suspended, expired or cancelled.";
   if(!window.confirm(message)) event.preventDefault();
 }} className="grid justify-items-start gap-2">
  <input type="hidden" name="gym_id" value={gymId}/>
  <input type="hidden" name="next_status" value={next}/>
  <Button type="submit" size="sm" variant={next==="suspended"?"outline":"secondary"} disabled={pending}>
   {pending?(next==="suspended"?"Suspending…":"Saving…"):label}
  </Button>
  {state.message?<p role={state.status==="error"?"alert":"status"} className={`max-w-56 text-xs leading-5 ${state.status==="error"?"text-destructive":"text-positive"}`}>{state.message}</p>:null}
 </form>;
}
