"use client";
import { useActionState } from "react";
import { saveGymSettingsAction } from "@/app/(gym)/gym/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormActionState } from "@/lib/forms";
const initial: FormActionState = { status: "idle", message: "" };
export function GymSettingsForm({ gym, settings }: { gym: { name: string; owner_name: string | null; phone: string | null; email: string | null; address: string | null }; settings: { currency: string; timezone: string } }) {
 const [state, action, pending] = useActionState(saveGymSettingsAction, initial);
 return <form action={action} className="grid gap-4 sm:grid-cols-2">
  <div><Label htmlFor="gym-name">Gym name</Label><Input id="gym-name" name="name" defaultValue={gym.name} maxLength={160} required/></div><div><Label htmlFor="gym-owner">Owner name</Label><Input id="gym-owner" name="owner_name" defaultValue={gym.owner_name ?? ""} maxLength={120}/></div>
  <div><Label htmlFor="gym-phone">Phone</Label><Input id="gym-phone" name="phone" type="tel" defaultValue={gym.phone ?? ""} maxLength={40}/></div><div><Label htmlFor="gym-email">Email</Label><Input id="gym-email" name="email" type="email" defaultValue={gym.email ?? ""} maxLength={254}/></div>
  <div className="sm:col-span-2"><Label htmlFor="gym-address">Address</Label><Textarea id="gym-address" name="address" defaultValue={gym.address ?? ""} maxLength={1000}/></div>
  <div><Label htmlFor="gym-currency">Currency code</Label><Input id="gym-currency" name="currency" defaultValue={settings.currency} pattern="[A-Z]{3}" maxLength={3} required/></div>
  <div><Label htmlFor="gym-timezone">Timezone (IANA)</Label><Input id="gym-timezone" name="timezone" defaultValue={settings.timezone} placeholder="Asia/Kolkata" maxLength={80} required/></div>
  <div><Label htmlFor="gym-logo">Logo (JPG/PNG, max 2 MB)</Label><Input id="gym-logo" name="logo" type="file" accept="image/jpeg,image/png"/></div>
  <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="remove_logo"/>Remove current logo</label>
  <div className="sm:col-span-2"><Button disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>{state.message ? <p role={state.status === "error" ? "alert" : "status"} className="mt-2 text-sm">{state.message}</p> : null}</div>
 </form>;
}
