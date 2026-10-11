"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformOwner } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const schema=z.object({
  brand_name:z.string().trim().min(1).max(120),
  support_email:z.string().trim().max(254).optional().default(""),
  default_currency:z.string().trim().regex(/^[A-Za-z]{3}$/,"Use a three-letter currency code."),
  default_timezone:z.string().trim().min(1).max(100),
});
function get(formData:FormData,key:string){const item=formData.get(key);return typeof item==="string"?item:""}
function errors(error:z.ZodError){const out:Record<string,string>={};for(const issue of error.issues){const field=String(issue.path[0]??"");if(field&&!out[field])out[field]=issue.message;}return out;}

export async function updatePlatformSettingsAction(_previousState:FormActionState,formData:FormData):Promise<FormActionState>{
  await requirePlatformOwner();
  if(process.env.VERCEL_ENV!=="production")return {status:"error",message:"Platform settings writes are disabled in preview builds to protect production data."};
  const parsed=schema.safeParse({brand_name:get(formData,"brand_name"),support_email:get(formData,"support_email"),default_currency:get(formData,"default_currency"),default_timezone:get(formData,"default_timezone")});
  if(!parsed.success)return {status:"error",message:"Review the settings and try again.",fieldErrors:errors(parsed.error)};
  const p=parsed.data;
  if(p.support_email&&!z.string().email().safeParse(p.support_email).success)return {status:"error",message:"Enter a valid support email.",fieldErrors:{support_email:"Enter a valid email address."}};
  const currency=p.default_currency.toUpperCase();
  try{new Intl.DateTimeFormat("en-US",{timeZone:p.default_timezone}).format(new Date());}catch{return {status:"error",message:"Select a valid IANA timezone.",fieldErrors:{default_timezone:"Enter a valid timezone, e.g. Asia/Kolkata."}};}
  const supabase=await createServerSupabaseClient();
  const {data,error}=await supabase.from("platform_settings").update({brand_name:p.brand_name,support_email:p.support_email||null,default_currency:currency,default_timezone:p.default_timezone}).eq("id",1).select("id").maybeSingle();
  if(error||!data)return {status:"error",message:"Settings could not be saved. Refresh and try again."};
  revalidatePath("/platform/settings");revalidatePath("/platform");
  return {status:"success",message:"Platform settings saved."};
}
