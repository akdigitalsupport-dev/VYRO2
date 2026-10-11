"use client";

import { useActionState } from "react";
import { updatePlatformSettingsAction } from "@/app/(platform)/platform/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormActionState } from "@/lib/forms";

export function PlatformSettingsForm({settings}:{settings:{brand_name:string;support_email:string|null;default_currency:string;default_timezone:string}}){
 const [state,action,pending]=useActionState(updatePlatformSettingsAction,initialFormActionState);
 return <form action={action} className="grid gap-5 rounded-lg border border-border bg-surface p-4 sm:p-6">
  <div><h2 className="font-display text-base font-semibold">General settings</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">These defaults apply to platform reporting and future subscription workflows. Gym-level settings remain separate.</p></div>
  {state.message?<p role={state.status==="error"?"alert":"status"} className={`rounded-md border p-3 text-sm ${state.status==="error"?"border-destructive/40 bg-destructive/5 text-destructive":"border-positive/40 bg-positive/5 text-positive"}`}>{state.message}</p>:null}
  <Field name="brand_name" label="Platform brand name" defaultValue={settings.brand_name} required error={state.fieldErrors?.brand_name}/>
  <div className="grid gap-3 sm:grid-cols-2">
   <Field name="support_email" label="Support email" type="email" defaultValue={settings.support_email??""} error={state.fieldErrors?.support_email}/>
   <Field name="default_currency" label="Default currency" defaultValue={settings.default_currency.trim()} required error={state.fieldErrors?.default_currency}/>
  </div>
  <Field name="default_timezone" label="Default timezone" defaultValue={settings.default_timezone} required error={state.fieldErrors?.default_timezone}/>
  <p className="text-xs leading-5 text-muted-foreground">Timezone must be an IANA identifier such as Asia/Kolkata. Secrets, API keys and service-role credentials are not editable here; they must stay in server environment configuration.</p>
  <Button type="submit" disabled={pending}>{pending?"Saving…":"Save platform settings"}</Button>
 </form>;
}
function Field({name,label,type="text",defaultValue,required=false,error}:{name:string;label:string;type?:string;defaultValue:string;required?:boolean;error?:string}){
 return <div className="grid gap-1.5"><Label htmlFor={`setting-${name}`}>{label}</Label><Input id={`setting-${name}`} name={name} type={type} defaultValue={defaultValue} required={required} maxLength={254} aria-invalid={Boolean(error)}/>{error?<p className="text-xs text-destructive">{error}</p>:null}</div>;
}
