"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformOwner } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const planSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.").max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().default(""),
  price: z.string().trim().optional().default(""),
  billing_period: z.enum(["monthly", "quarterly", "yearly", "custom"]),
  trial_days: z.coerce.number().int().min(1).max(90),
  is_active: z.enum(["on", "off"]).default("off"),
});

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}
function fieldErrors(error: z.ZodError) {
  const result: Record<string,string> = {};
  for(const issue of error.issues){ const field=String(issue.path[0]??""); if(field&&!result[field]) result[field]=issue.message; }
  return result;
}

export async function savePlatformPlanAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  await requirePlatformOwner();
  if(process.env.VERCEL_ENV!=="production") return {status:"error",message:"Plan changes are disabled in preview builds to protect production data."};

  const parsed=planSchema.safeParse({
    id:value(formData,"id"), slug:value(formData,"slug"), name:value(formData,"name"),
    description:value(formData,"description"), price:value(formData,"price"),
    billing_period:value(formData,"billing_period"), trial_days:value(formData,"trial_days"),
    is_active:value(formData,"is_active")||"off",
  });
  if(!parsed.success) return {status:"error",message:"Review plan details and try again.",fieldErrors:fieldErrors(parsed.error)};
  const p=parsed.data;
  let price:number|null=null;
  if(p.price){ price=Number(p.price); if(!Number.isFinite(price)||price<0||price>9999999999.99||Math.abs(price*100-Math.round(price*100))>0.000001) return {status:"error",message:"Enter a valid price with up to two decimal places.",fieldErrors:{price:"Use a valid non-negative amount with up to two decimal places."}};}
  if(p.is_active==="on"&&(!price||price<=0)) return {status:"error",message:"An active paid plan must have a price greater than ₹0.",fieldErrors:{price:"Set a price before activating a paid plan."}};

  const supabase=await createServerSupabaseClient();
  const record={slug:p.slug,name:p.name,description:p.description||null,price,currency:"INR",billing_period:p.billing_period,trial_days:p.trial_days,is_active:p.is_active==="on"};
  const query=p.id
    ? await supabase.from("platform_plans").update(record).eq("id",p.id).select("id").maybeSingle()
    : await supabase.from("platform_plans").insert(record).select("id").maybeSingle();
  if(query.error||!query.data) return {status:"error",message:query.error?.code==="23505"?"A plan with this slug already exists. Choose another slug.":"The plan could not be saved. Refresh and try again."};

  revalidatePath("/platform/plans"); revalidatePath("/platform/plans/pricing"); revalidatePath("/platform/revenue");
  return {status:"success",message:p.id?"Plan updated.":"Plan created.",recordId:query.data.id};
}
