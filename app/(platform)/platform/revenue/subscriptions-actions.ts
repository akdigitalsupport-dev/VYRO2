"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformOwner } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const pricingSchema=z.object({
  subscription_id:z.string().uuid(),
  pricing_mode:z.enum(["standard","custom"]),
  plan_id:z.string().uuid().optional().or(z.literal("")),
  custom_name:z.string().trim().min(1).max(120).optional().default(""),
  custom_amount:z.string().trim().optional().default(""),
  billing_period:z.enum(["monthly","quarterly","yearly","custom"]),
  expires_on:z.string().regex(/^\d{4}-\d{2}-\d{2}$/,"Select a valid expiry date."),
});
const statusSchema=z.object({subscription_id:z.string().uuid(),next_status:z.enum(["trial","active","past_due","expired","suspended","cancelled"]),activation_expires_on:z.string().optional().default("")});
function get(fd:FormData,key:string){const v=fd.get(key);return typeof v==="string"?v:""}
function errs(error:z.ZodError){const out:Record<string,string>={};for(const issue of error.issues){const key=String(issue.path[0]??"");if(key&&!out[key])out[key]=issue.message;}return out;}
function previewBlocked():FormActionState{return {status:"error",message:"SaaS pricing and subscription writes are disabled in preview builds to protect production data."};}

export async function updateSubscriptionPricingAction(_previousState:FormActionState,fd:FormData):Promise<FormActionState>{
 await requirePlatformOwner();if(process.env.VERCEL_ENV!=="production")return previewBlocked();
 const parsed=pricingSchema.safeParse({subscription_id:get(fd,"subscription_id"),pricing_mode:get(fd,"pricing_mode"),plan_id:get(fd,"plan_id"),custom_name:get(fd,"custom_name"),custom_amount:get(fd,"custom_amount"),billing_period:get(fd,"billing_period"),expires_on:get(fd,"expires_on")});
 if(!parsed.success)return {status:"error",message:"Review the pricing details and try again.",fieldErrors:errs(parsed.error)};
 const p=parsed.data;
 const supabase=await createServerSupabaseClient();
 const {data:subscription,error:subscriptionError}=await supabase.from("platform_subscriptions").select("id,status,starts_on,expires_on,amount,currency").eq("id",p.subscription_id).maybeSingle();
 if(subscriptionError||!subscription)return {status:"error",message:"Subscription could not be found. Refresh and try again."};
 if(subscription.status==="cancelled")return {status:"error",message:"Cancelled subscriptions cannot be repriced. Create a new subscription for a future agreement."};
 const expiryDate = new Date(`${p.expires_on}T00:00:00Z`);
 if(Number.isNaN(expiryDate.getTime()) || expiryDate.toISOString().slice(0,10)!==p.expires_on) return {status:"error",message:"Expiry date is invalid.",fieldErrors:{expires_on:"Choose a real calendar date."}};
 if(p.expires_on<subscription.starts_on)return {status:"error",message:"Expiry date cannot be earlier than the subscription start date.",fieldErrors:{expires_on:"Choose a date on or after the start date."}};
 if(subscription.status==="trial"){
  const latestAllowed = new Date(`${subscription.starts_on}T00:00:00Z`);
  if(Number.isNaN(latestAllowed.getTime())) return {status:"error",message:"The subscription start date is invalid.",fieldErrors:{expires_on:"Refresh and review the current start date."}};
  latestAllowed.setUTCDate(latestAllowed.getUTCDate()+89);
  if(p.expires_on>latestAllowed.toISOString().slice(0,10)) return {status:"error",message:"Free trials cannot exceed 90 days from the start date.",fieldErrors:{expires_on:"Choose an expiry within 90 days of the trial start date."}};
 }

 let planName:string,planId:string|null=null,amount:number,resolvedBillingPeriod=p.billing_period;
 if(p.pricing_mode==="standard"){
  if(!p.plan_id)return {status:"error",message:"Select an active SaaS plan.",fieldErrors:{plan_id:"Select an active plan."}};
  const {data:plan,error}=await supabase.from("platform_plans").select("id,name,price,currency,billing_period,is_active").eq("id",p.plan_id).maybeSingle();
  if(error||!plan||!plan.is_active||plan.price===null||Number(plan.price)<=0)return {status:"error",message:"The selected SaaS plan is unavailable or has no active price.",fieldErrors:{plan_id:"Choose a configured active plan."}};
  planName=plan.name;planId=plan.id;amount=Number(plan.price);resolvedBillingPeriod=plan.billing_period;
 }else{
  planName=p.custom_name.trim();
  amount=Number(p.custom_amount);
  if(!planName)return {status:"error",message:"Enter a label for the custom pricing agreement.",fieldErrors:{custom_name:"Enter a plan or agreement label."}};
  if(!Number.isFinite(amount)||amount<=0||amount>9999999999.99||Math.abs(amount*100-Math.round(amount*100))>0.000001)return {status:"error",message:"Custom price must be greater than zero and use at most two decimal places.",fieldErrors:{custom_amount:"Enter a valid price."}};
 }
 const {data:updated,error}=await supabase.from("platform_subscriptions").update({plan_id:planId,plan_name:planName,amount,currency:"INR",billing_period:resolvedBillingPeriod,expires_on:p.expires_on}).eq("id",p.subscription_id).select("id").maybeSingle();
 if(error||!updated)return {status:"error",message:"Pricing could not be saved. Check the platform subscription schema and try again."};
 revalidatePath("/platform/revenue");revalidatePath("/platform/revenue/outstanding");revalidatePath("/platform/plans/pricing");revalidatePath("/platform/gyms");revalidatePath("/platform/gyms/trials");revalidatePath("/platform/trials");
 return {status:"success",message:"Subscription pricing and expiry updated. No payment was recorded.",recordId:updated.id};
}

export async function updateSubscriptionStatusAction(_previousState:FormActionState,fd:FormData):Promise<FormActionState>{
 await requirePlatformOwner();if(process.env.VERCEL_ENV!=="production")return previewBlocked();
 const parsed=statusSchema.safeParse({subscription_id:get(fd,"subscription_id"),next_status:get(fd,"next_status"),activation_expires_on:get(fd,"activation_expires_on")});
 if(!parsed.success)return {status:"error",message:"Choose a valid subscription status."};
 const {subscription_id,next_status}=parsed.data;
 const supabase=await createServerSupabaseClient();
 const {data:subscription,error:readError}=await supabase.from("platform_subscriptions").select("id,status,amount,currency,starts_on,expires_on,billing_period").eq("id",subscription_id).maybeSingle();
 if(readError||!subscription)return {status:"error",message:"Subscription could not be found."};
 if(subscription.status===next_status)return {status:"success",message:"Subscription is already in that status.",recordId:subscription.id};
 const today=todayInIndia();
 if(next_status==="active"&&subscription.status==="expired")return {status:"error",message:"Expired subscriptions must be renewed as a new term. Use Renew subscription so previous payment history remains attached to the old term."};
 if(next_status==="active"&&subscription.expires_on<today&&["past_due","suspended"].includes(subscription.status))return {status:"error",message:"This subscription term has ended. Use Renew subscription to create a new paid term before recording its payment."};
 let renewedDates:{starts_on:string;expires_on:string}|null=null;
 if(next_status==="active"){
  if(Number(subscription.amount)<=0)return {status:"error",message:"Set a paid plan or custom price before activating this subscription."};
  const {data:completedPayments,error:paymentError}=await supabase.from("platform_subscription_payments").select("amount,currency").eq("subscription_id",subscription_id).eq("status","completed");
  if(paymentError)return {status:"error",message:"Completed payment records could not be verified. Refresh the ledger and try again."};
  const verifiedAmount=(completedPayments??[]).filter(payment=>payment.currency.trim()===subscription.currency.trim()).reduce((sum,payment)=>sum+Number(payment.amount),0);
  if(verifiedAmount+0.000001<Number(subscription.amount)){
    const remaining=Math.max(0,Math.round((Number(subscription.amount)-verifiedAmount)*100)/100);
    return {status:"error",message:"The completed, verified payments do not yet cover this subscription term.",fieldErrors:{next_status:"Verify payment(s) for the remaining "+new Intl.NumberFormat("en-IN",{style:"currency",currency:subscription.currency.trim(),maximumFractionDigits:2}).format(remaining)+" before activating."}};
  }
  const startsPaidTerm=subscription.status==="trial"||subscription.expires_on<today;
  if(startsPaidTerm){
    let newExpiry:string;
    if(subscription.billing_period==="custom"){
      const selected=parsed.data.activation_expires_on;
      const date=new Date(`${selected}T00:00:00Z`);
      if(!selected||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==selected||selected<today)
        return {status:"error",message:"Set a valid future paid-term expiry date for this custom agreement.",fieldErrors:{activation_expires_on:"Choose a real date today or later."}};
      newExpiry=selected;
    }else{
      newExpiry=periodEndFrom(today,subscription.billing_period);
    }
    renewedDates={starts_on:today,expires_on:newExpiry};
  }
 }
 const updatePayload={status:next_status,...(renewedDates??{})};
 const {data,error}=await supabase.from("platform_subscriptions").update(updatePayload).eq("id",subscription_id).eq("status",subscription.status).select("id").maybeSingle();
 if(error||!data)return {status:"error",message:"This transition was rejected by the subscription lifecycle rules. Refresh and review the current status."};
 revalidatePath("/platform/revenue");revalidatePath("/platform/revenue/outstanding");revalidatePath("/platform/plans/pricing");revalidatePath("/platform/gyms");revalidatePath("/platform/gyms/trials");revalidatePath("/platform/trials");
 return {status:"success",message:renewedDates?`Subscription activated with a new paid term through ${renewedDates.expires_on}.`: `Subscription status changed to ${next_status.replaceAll("_"," ")}.`,recordId:data.id};
}
function todayInIndia(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${x.year}-${x.month}-${x.day}`;}

function periodEndFrom(start:string,billingPeriod:string):string{
 const [year,month,day]=start.split("-").map(Number);
 const months=billingPeriod==="quarterly"?3:billingPeriod==="yearly"?12:1;
 const targetFirst=new Date(Date.UTC(year,month-1+months,1));
 const lastDay=new Date(Date.UTC(targetFirst.getUTCFullYear(),targetFirst.getUTCMonth()+1,0)).getUTCDate();
 const clampedDay=Math.min(day,lastDay);
 const end=new Date(Date.UTC(targetFirst.getUTCFullYear(),targetFirst.getUTCMonth(),clampedDay));
 end.setUTCDate(end.getUTCDate()-1);
 return end.toISOString().slice(0,10);
}

const renewalSchema=z.object({
 subscription_id:z.string().uuid(),
 renewal_expires_on:z.string().optional().default(""),
});

export async function renewPlatformSubscriptionAction(
 _previousState:FormActionState,
 fd:FormData,
):Promise<FormActionState>{
 await requirePlatformOwner();
 if(process.env.VERCEL_ENV!=="production")return previewBlocked();
 const parsed=renewalSchema.safeParse({
  subscription_id:get(fd,"subscription_id"),
  renewal_expires_on:get(fd,"renewal_expires_on"),
 });
 if(!parsed.success)return {status:"error",message:"Choose a valid subscription to renew."};

 const supabase=await createServerSupabaseClient();
 const {data:old,error:readError}=await supabase.from("platform_subscriptions")
  .select("id,gym_id,plan_id,plan_name,amount,currency,billing_period,status,starts_on,expires_on")
  .eq("id",parsed.data.subscription_id).maybeSingle();
 if(readError||!old)return {status:"error",message:"Subscription could not be found. Refresh and try again."};
 if(!["expired","cancelled","suspended","past_due","trial"].includes(old.status))
  return {status:"error",message:"Only an ended, cancelled, suspended or expired subscription can start a new paid term."};

 const today=todayInIndia();
 if(old.status!=="expired"&&old.status!=="cancelled"&&old.expires_on>=today)
  return {status:"error",message:"This subscription term has not ended. Update its current status or expiry instead of creating a duplicate term."};
 const amount=Number(old.amount);
 if(!Number.isFinite(amount)||amount<=0)
  return {status:"error",message:"Set a positive subscription price before creating a paid renewal."};

 const {data:otherSubscriptions,error:otherError}=await supabase.from("platform_subscriptions")
  .select("id,status,expires_on")
  .eq("gym_id",old.gym_id)
  .in("status",["trial","active","past_due","suspended"])
  .gte("expires_on",today)
  .neq("id",old.id)
  .limit(1);
 if(otherError)return {status:"error",message:"Could not verify whether this gym already has a current subscription. Refresh and try again."};
 if(otherSubscriptions?.length)
  return {status:"error",message:"This gym already has another non-expired subscription. Review that record before starting a second term."};

 let expiresOn:string;
 if(old.billing_period==="custom"){
  const chosen=parsed.data.renewal_expires_on;
  const date=new Date(`${chosen}T00:00:00Z`);
  if(!chosen||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==chosen||chosen<today)
   return {status:"error",message:"Choose a valid expiry date for this custom paid agreement.",fieldErrors:{renewal_expires_on:"Choose a real date today or later."}};
  expiresOn=chosen;
 }else{
  expiresOn=periodEndFrom(today,old.billing_period);
 }
 if(expiresOn<today)return {status:"error",message:"The new paid term expiry must be today or later."};

 const {data:created,error}=await supabase.from("platform_subscriptions").insert({
  gym_id:old.gym_id,
  plan_id:old.plan_id,
  plan_name:old.plan_name,
  amount,
  currency:old.currency,
  billing_period:old.billing_period,
  starts_on:today,
  expires_on:expiresOn,
  status:"past_due",
 }).select("id").maybeSingle();
 if(error||!created){
  console.error("Platform renewal creation failed",{code:error?.code});
  return {status:"error",message:"The new subscription term could not be created. No payment was marked received."};
 }
 revalidatePath("/platform");revalidatePath("/platform/revenue");revalidatePath("/platform/revenue/outstanding");revalidatePath("/platform/revenue/payments");revalidatePath("/platform/plans/pricing");revalidatePath("/platform/gyms");revalidatePath("/platform/gyms/trials");revalidatePath("/platform/trials");
 return {status:"success",message:`New ${old.billing_period} term created through ${expiresOn} as past due. Record and verify its payment in SaaS Payments before activating it.`,recordId:created.id};
}
