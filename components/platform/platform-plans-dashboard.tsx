"use client";

import { useActionState } from "react";
import { savePlatformPlanAction } from "@/app/(platform)/platform/plans/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initialFormActionState } from "@/lib/forms";

export type PlatformPlanRecord = {
  id:string; slug:string; name:string; description:string|null; price:number|string|null;
  currency:string; billing_period:string; trial_days:number; is_active:boolean;
};

export function PlatformPlansDashboard({plans}:{plans:PlatformPlanRecord[]}) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3"><h2 className="font-display text-sm font-semibold">Current plan catalogue</h2><p className="mt-1 text-xs text-muted-foreground">Starter, Growth, Pro and Enterprise are templates. Set pricing before enabling a plan.</p></div>
        {plans.length===0?<p className="p-4 text-sm text-muted-foreground">No plan records were returned.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-background/55 text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Billing</th><th className="px-4 py-3">Trial</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Edit</th></tr></thead><tbody className="divide-y divide-border">{plans.map(plan=><tr key={plan.id}><td className="px-4 py-3"><p className="font-medium">{plan.name}</p><p className="mt-1 text-xs text-muted-foreground">{plan.slug}</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">{plan.description||"No description"}</p></td><td className="px-4 py-3 tabular-nums">{plan.price===null?"Not set":formatInr(Number(plan.price))}</td><td className="px-4 py-3 text-xs">{humanize(plan.billing_period)}</td><td className="px-4 py-3 text-xs">{plan.trial_days} days</td><td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs ${plan.is_active?"border-positive/30 bg-positive/10 text-positive":"border-border bg-background text-muted-foreground"}`}>{plan.is_active?"Active":"Inactive"}</span></td><td className="px-4 py-3"><a className="text-accent underline-offset-4 hover:underline" href={`#edit-${plan.id}`}>Edit below</a></td></tr>)}</tbody></table></div>}
      </section>
      <div className="grid gap-5 xl:grid-cols-2"><PlanForm title="Create a new plan" /><div className="space-y-5">{plans.map(plan=><PlanForm key={plan.id} title={`Edit ${plan.name}`} plan={plan}/>)}</div></div>
    </div>
  );
}

function PlanForm({title,plan}:{title:string;plan?:PlatformPlanRecord}){
  const [state,action,pending]=useActionState(savePlatformPlanAction,initialFormActionState);
  return <form id={plan?`edit-${plan.id}`:undefined} action={action} className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
    <h3 className="font-display text-sm font-semibold">{title}</h3>
    {state.message?<p role={state.status==="error"?"alert":"status"} className={`rounded-md border p-3 text-xs ${state.status==="error"?"border-destructive/40 bg-destructive/5 text-destructive":"border-positive/40 bg-positive/5 text-positive"}`}>{state.message}</p>:null}
    <input type="hidden" name="id" value={plan?.id??""}/>
    <div className="grid gap-3 sm:grid-cols-2"><Field name="name" label="Plan name" value={plan?.name} required error={state.fieldErrors?.name}/><Field name="slug" label="Slug" value={plan?.slug} required error={state.fieldErrors?.slug}/></div>
    <div className="grid gap-1.5"><Label htmlFor={`desc-${plan?.id??"new"}`}>Description</Label><Textarea id={`desc-${plan?.id??"new"}`} name="description" defaultValue={plan?.description??""} maxLength={2000}/></div>
    <div className="grid gap-3 sm:grid-cols-2"><Field name="price" label="Monthly / billing price (₹)" type="number" value={plan?.price==null?"":String(plan.price)} error={state.fieldErrors?.price} min="0" step="0.01"/><div className="grid gap-1.5"><Label htmlFor={`period-${plan?.id??"new"}`}>Billing period</Label><select id={`period-${plan?.id??"new"}`} name="billing_period" defaultValue={plan?.billing_period??"monthly"} className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option><option value="custom">Custom</option></select></div></div>
    <div className="grid gap-1.5"><Label htmlFor={`trial-${plan?.id??"new"}`}>Default trial duration (days)</Label><Input id={`trial-${plan?.id??"new"}`} name="trial_days" type="number" min="1" max="90" defaultValue={plan?.trial_days??14} required/></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" value="on" defaultChecked={plan?.is_active??false} className="h-4 w-4 accent-[var(--accent)]"/>Plan is available for new subscriptions</label>
    <p className="text-xs leading-5 text-muted-foreground">No payment is charged here. Activating a plan only makes it available for subscription provisioning.</p>
    <Button type="submit" disabled={pending}>{pending?"Saving…":plan?"Save plan":"Create plan"}</Button>
  </form>;
}

function Field({name,label,type="text",value,required=false,error,min,step}:{name:string;label:string;type?:string;value?:string;required?:boolean;error?:string;min?:string;step?:string}){
 return <div className="grid min-w-0 gap-1.5"><Label htmlFor={`${name}-${value??"new"}`}>{label}</Label><Input id={`${name}-${value??"new"}`} name={name} type={type} defaultValue={value} required={required} min={min} step={step} maxLength={254} aria-invalid={Boolean(error)}/>{error?<p className="text-xs text-destructive">{error}</p>:null}</div>;
}
function humanize(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());}
function formatInr(value:number){return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(value);}
