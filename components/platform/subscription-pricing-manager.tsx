"use client";

import { useActionState, useState } from "react";
import { updateSubscriptionPricingAction, updateSubscriptionStatusAction } from "@/app/(platform)/platform/revenue/subscriptions-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormActionState } from "@/lib/forms";

type PlanOption={id:string;name:string;price:number|string|null;currency:string;billing_period:string;trial_days:number;is_active:boolean};
type SubscriptionOption={id:string;gym_id:string;plan_id:string|null;plan_name:string;amount:number|string;currency:string;status:string;billing_period:string;starts_on:string;expires_on:string;gym_name:string;owner_name:string|null;owner_email:string|null};

export function SubscriptionPricingManager({subscriptions,plans}:{subscriptions:SubscriptionOption[];plans:PlanOption[]}){
 if(!subscriptions.length)return <p className="text-sm text-muted-foreground">No subscription records are available to price yet. Create a gym and start its free trial to add the first record.</p>;
 return <div className="space-y-4">{subscriptions.map(subscription=><SubscriptionPricingCard key={subscription.id} subscription={subscription} plans={plans}/>)}</div>;
}

function SubscriptionPricingCard({subscription,plans}:{subscription:SubscriptionOption;plans:PlanOption[]}){
 const activePlans=plans.filter(p=>p.is_active!==false && p.price!==null && Number(p.price)>0);
 const linkedPlan=plans.find(p=>p.id===subscription.plan_id);
 const [mode,setMode]=useState<"standard"|"custom">(linkedPlan?"standard":"custom");
 const [priceState,priceAction,pricePending]=useActionState(updateSubscriptionPricingAction,initialFormActionState);
 const [statusState,statusAction,statusPending]=useActionState(updateSubscriptionStatusAction,initialFormActionState);
 const transitions:Record<string,string[]>={trial:["active","past_due","expired","suspended","cancelled"],active:["past_due","expired","suspended","cancelled"],past_due:["active","expired","suspended","cancelled"],suspended:["active","expired","cancelled"],expired:["active","cancelled"],cancelled:[]};
 const canTransition=transitions[subscription.status]??[];
 return <article className="rounded-lg border border-border bg-surface p-4 sm:p-5">
  <header className="flex flex-col gap-2 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
   <div><h3 className="font-display text-base font-semibold">{subscription.gym_name}</h3><p className="mt-1 text-xs text-muted-foreground">{subscription.owner_name??subscription.owner_email??"Owner not recorded"} · {subscription.plan_name}</p></div>
   <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-border px-2 py-1 text-xs">{humanize(subscription.status)}</span><span className="rounded-full border border-border px-2 py-1 text-xs">{formatCurrency(Number(subscription.amount),subscription.currency)}</span></div>
  </header>
  <div className="grid gap-5 pt-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
   <form action={priceAction} className="grid content-start gap-3 rounded-md border border-border/70 bg-background/25 p-3">
    <h4 className="text-sm font-semibold">Pricing and expiry</h4>
    {priceState.message?<p role={priceState.status==="error"?"alert":"status"} className={`rounded-md border p-2 text-xs ${priceState.status==="error"?"border-destructive/40 bg-destructive/5 text-destructive":"border-positive/40 bg-positive/5 text-positive"}`}>{priceState.message}</p>:null}
    <input type="hidden" name="subscription_id" value={subscription.id}/>
    <div className="grid gap-1.5"><Label htmlFor={`pricing-mode-${subscription.id}`}>Pricing type</Label><select id={`pricing-mode-${subscription.id}`} name="pricing_mode" value={mode} onChange={e=>setMode(e.target.value as "standard"|"custom")} className="min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"><option value="standard">Standard SaaS plan</option><option value="custom">Custom agreement</option></select></div>
    {mode==="standard"?<div className="grid gap-1.5"><Label htmlFor={`plan-${subscription.id}`}>Active plan</Label><select id={`plan-${subscription.id}`} name="plan_id" defaultValue={linkedPlan?.id??""} required className="min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"><option value="" disabled>Select a plan</option>{activePlans.map(plan=><option key={plan.id} value={plan.id}>{plan.name} · {formatCurrency(Number(plan.price),plan.currency)} / {humanize(plan.billing_period)}</option>)}</select>{activePlans.length===0?<p className="text-xs text-muted-foreground">No active priced plans. Set a price and activate a plan in the SaaS Plans section first.</p>:null}{priceState.fieldErrors?.plan_id?<p className="text-xs text-destructive">{priceState.fieldErrors.plan_id}</p>:null}</div>:<>
     <Field id={`custom-name-${subscription.id}`} name="custom_name" label="Custom agreement name" defaultValue={subscription.plan_name==="Free Trial"?"Custom":subscription.plan_name} error={priceState.fieldErrors?.custom_name}/>
     <Field id={`custom-amount-${subscription.id}`} name="custom_amount" label="Monthly / agreed price (₹)" type="number" min="0.01" step="0.01" defaultValue={Number(subscription.amount)>0?String(subscription.amount):""} error={priceState.fieldErrors?.custom_amount}/>
    </>}
    <div className="grid gap-1.5"><Label htmlFor={`billing-${subscription.id}`}>Billing period</Label><select id={`billing-${subscription.id}`} name="billing_period" defaultValue={subscription.billing_period} className="min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option><option value="custom">Custom</option></select></div>
    <Field id={`expires-${subscription.id}`} name="expires_on" label={subscription.status==="trial"?"Trial expiry date":"Subscription expiry date"} type="date" defaultValue={subscription.expires_on} required error={priceState.fieldErrors?.expires_on}/>
    {subscription.status==="trial"?<p className="text-xs leading-5 text-muted-foreground">Trial subscriptions should remain within the approved maximum 90-day trial period. Set paid pricing before creating a payment record.</p>:null}
    <Button type="submit" variant="outline" disabled={pricePending}>{pricePending?"Saving…":"Save pricing / expiry"}</Button>
   </form>

   <form action={statusAction} className="grid content-start gap-3 rounded-md border border-border/70 bg-background/25 p-3">
    <h4 className="text-sm font-semibold">Subscription status</h4>
    {statusState.message?<p role={statusState.status==="error"?"alert":"status"} className={`rounded-md border p-2 text-xs ${statusState.status==="error"?"border-destructive/40 bg-destructive/5 text-destructive":"border-positive/40 bg-positive/5 text-positive"}`}>{statusState.message}</p>:null}
    <input type="hidden" name="subscription_id" value={subscription.id}/>
    <div className="grid gap-1.5"><Label htmlFor={`next-status-${subscription.id}`}>Change status</Label><select id={`next-status-${subscription.id}`} name="next_status" defaultValue={canTransition[0]??subscription.status} disabled={!canTransition.length} className="min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm">{[subscription.status,...canTransition].filter((v,i,a)=>a.indexOf(v)===i).map(status=><option key={status} value={status}>{humanize(status)}</option>)}</select></div>
    <p className="text-xs leading-5 text-muted-foreground">Activating a paid subscription requires a configured paid price and at least one completed payment record. Selecting a status never creates a payment.</p>
    <Button type="submit" variant="outline" disabled={statusPending||!canTransition.length}>{statusPending?"Saving…":canTransition.length?"Save status":"Subscription cancelled"}</Button>
    {subscription.status==="trial"||subscription.status==="past_due"?<a className="text-xs text-accent underline-offset-4 hover:underline" href="/platform/revenue/payments">Open SaaS Payments to record / verify a payment</a>:null}
   </form>
  </div>
  <p className="mt-3 text-xs text-muted-foreground">Start {formatDate(subscription.starts_on)} · Current expiry {formatDate(subscription.expires_on)} · Changes are written to the platform audit trail.</p>
 </article>;
}

function Field({id,name,label,type="text",defaultValue,required=false,min,step,error}:{id:string;name:string;label:string;type?:string;defaultValue:string;required?:boolean;min?:string;step?:string;error?:string}){
 return <div className="grid gap-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} type={type} defaultValue={defaultValue} required={required} min={min} step={step} aria-invalid={Boolean(error)}/>{error?<p className="text-xs text-destructive">{error}</p>:null}</div>;
}
function humanize(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());}
function formatCurrency(amount:number,currency:string){return new Intl.NumberFormat("en-IN",{style:"currency",currency:currency.trim(),maximumFractionDigits:2}).format(amount);}
function formatDate(value:string){const d=new Date(`${value}T00:00:00Z`);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeZone:"Asia/Kolkata"}).format(d);}
