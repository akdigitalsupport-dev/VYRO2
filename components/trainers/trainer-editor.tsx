"use client";
import { useActionState } from "react";
import { saveTrainerAction } from "@/app/(gym)/gym/trainers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
const initial = { status: "idle" as const, message: "" };
export function TrainerEditor({ item }: { item?: { id: string; name: string; phone: string | null; specialization: string | null; notes: string | null; status: string } }) {
 const [state, action, pending] = useActionState(saveTrainerAction, initial);
 return <form action={action} className="grid gap-3 rounded-lg border border-border/80 bg-background/60 p-3 sm:grid-cols-2">{item ? <input type="hidden" name="id" value={item.id}/> : null}
  <div><Label>Name</Label><Input name="name" defaultValue={item?.name} maxLength={120} required/></div><div><Label>Phone</Label><Input name="phone" defaultValue={item?.phone ?? ""} maxLength={40}/></div>
  <div><Label>Specialization</Label><Input name="specialization" defaultValue={item?.specialization ?? ""} maxLength={120}/></div><div><Label>Status</Label><select name="status" defaultValue={item?.status ?? "active"} className="h-10 w-full rounded-md border border-input bg-[#101512] px-3 text-sm"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
  <div className="sm:col-span-2"><Label>Notes</Label><textarea name="notes" defaultValue={item?.notes ?? ""} maxLength={1000} className="min-h-20 w-full rounded-md border border-input bg-[#101512] p-3 text-sm"/></div>
  <div><Button disabled={pending}>{pending ? "Saving…" : item ? "Save trainer" : "Add trainer"}</Button></div>{state.message ? <p role={state.status === "error" ? "alert" : "status"} className="self-center text-sm">{state.message}</p> : null}</form>;
}
