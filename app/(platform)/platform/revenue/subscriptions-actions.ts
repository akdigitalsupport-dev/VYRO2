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
const statusSchema=z.object({subscription_id:z.string().uuid(),next_status:z.enum(["trial","active","past_due","expired","suspended","cancelled"])});
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
 if(p.expires_on<subscription.starts_on)return {status:"error",message:"Expiry date cannot be earlier than the subscription start date.",fieldErrors:{expires_on:"Choose a date on or after the start date."}};

 let planName:string,planId:string|null=null,amount:number;
 if(p.pricing_mode==="standard"){
  if(!p.plan_id)return {status:"error",message:"Select an active SaaS plan.",fieldErrors:{plan_id:"Select an active plan."}};
  const {data:plan,error}=await supabase.from("platform_plans").select("id,name,price,currency,billing_period,is_active").eq("id",p.plan_id).maybeSingle();
  if(error||!plan||!plan.is_active||plan.price===null||Number(plan.price)<=0)return {status:"error",message:"The selected SaaS plan is unavailable or has no active price.",fieldErrors:{plan_id:"Choose a configured active plan."}};
  planName=plan.name;planId=plan.id;amount=Number(plan.price);
 }else{
  planName=p.custom_name.trim();
  amount=Number(p.custom_amount);
  if(!planName)return {status:"error",message:"Enter a label for the custom pricing agreement.",fieldErrors:{custom_name:"Enter a plan or agreement label."}};
  if(!Number.isFinite(amount)||amount<=0||amount>9999999999.99||Math.abs(amount*100-Math.round(amount*100))>0.000001)return {status:"error",message:"Custom price must be greater than zero and use at most two decimal places.",fieldErrors:{custom_amount:"Enter a valid price."}};
 }
 const {data:updated,error}=await supabase.from("platform_subscriptions").update({plan_id:planId,plan_name:planName,amount,currency:"INR",billing_period:p.billing_period,expires_on:p.expires_on}).eq("id",p.subscription_id).select("id").maybeSingle();
 if(error||!updated)return {status:"error",message:"Pricing could not be saved. Check the platform subscription schema and try again."};
 revalidatePath("/platform/revenue");revalidatePath("/platform/revenue/outstanding");revalidatePath("/platform/plans/pricing");revalidatePath("/platform/gyms");revalidatePath("/platform/gyms/trials");revalidatePath("/platform/trials");
 return {status:"success",message:"Subscription pricing and expiry updated. No payment was recorded.",recordId:updated.id};
}

export async function updateSubscriptionStatusAction(_previousState:FormActionState,fd:FormData):Promise<FormActionState>{
 await requirePlatformOwner();if(process.env.VERCEL_ENV!=="production")return previewBlocked();
 const parsed=statusSchema.safeParse({subscription_id:get(fd,"subscription_id"),next_status:get(fd,"next_status")});
 if(!parsed.success)return {status:"error",message:"Choose a valid subscription status."};
 const {subscription_id,next_status}=parsed.data;
 const supabase=await createServerSupabaseClient();
 const {data:subscription,error:readError}=await supabase.from("platform_subscriptions").select("id,status,amount,expires_on").eq("id",subscription_id).maybeSingle();
 if(readError||!subscription)return {status:"error",message:"Subscription could not be found."};
 if(subscription.status===next_status)return {status:"success",message:"Subscription is already in that status.",recordId:subscription.id};
 if(next_status==="active"){
  if(Number(subscription.amount)<=0)return {status:"error",message:"Set a paid plan or custom price before activating this subscription."};
  const {count,error:paymentError}=await supabase.from("platform_subscription_payments").select("id",{count:"exact",head:true}).eq("subscription_id",subscription_id).eq("status","completed");
  if(paymentError||!count)return {status:"error",message:"To activate a paid subscription, first record and verify at least one payment in SaaS Payments."};
  if(subscription.expires_on<todayInIndia())return {status:"error",message:"Extend the subscription expiry date before activating it."};
 }
 const {data,error}=await supabase.from("platform_subscriptions").update({status:next_status}).eq("id",subscription_id).eq("status",subscription.status).select("id").maybeSingle();
 if(error||!data)return {status:"error",message:"This transition was rejected by the subscription lifecycle rules. Refresh and review the current status."};
 revalidatePath("/platform/revenue");revalidatePath("/platform/revenue/outstanding");revalidatePath("/platform/plans/pricing");revalidatePath("/platform/gyms");revalidatePath("/platform/gyms/trials");revalidatePath("/platform/trials");
 return {status:"success",message:`Subscription status changed to ${next_status.replaceAll("_"," ")}.`,recordId:data.id};
}
function todayInIndia(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${x.year}-${x.month}-${x.day}`;}
