"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformOwner } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const createSchema=z.object({
  gym_id:z.string().uuid().optional().or(z.literal("")),
  subject:z.string().trim().min(3).max(180),
  description:z.string().trim().min(1).max(8000),
  requester_name:z.string().trim().max(120).optional().default(""),
  requester_email:z.string().trim().email().max(254).optional().or(z.literal("")),
  priority:z.enum(["low","normal","high","urgent"]),
});
const statusSchema=z.object({ticket_id:z.string().uuid(),status:z.enum(["open","in_progress","waiting_on_customer","resolved","closed"]),internal_notes:z.string().trim().max(8000).optional().default(""),resolution_summary:z.string().trim().max(2000).optional().default("")});
function get(formData:FormData,key:string){const value=formData.get(key);return typeof value==="string"?value:""}
function fieldErrors(error:z.ZodError){const result:Record<string,string>={};for(const issue of error.issues){const key=String(issue.path[0]??"");if(key&&!result[key])result[key]=issue.message;}return result;}

export async function createSupportTicketAction(_previousState:FormActionState,formData:FormData):Promise<FormActionState>{
  const owner=await requirePlatformOwner();
  if(process.env.VERCEL_ENV!=="production") return {status:"error",message:"Support ticket writes are disabled in preview builds to protect production data."};
  const parsed=createSchema.safeParse({gym_id:get(formData,"gym_id"),subject:get(formData,"subject"),description:get(formData,"description"),requester_name:get(formData,"requester_name"),requester_email:get(formData,"requester_email"),priority:get(formData,"priority")||"normal"});
  if(!parsed.success) return {status:"error",message:"Review the ticket details and try again.",fieldErrors:fieldErrors(parsed.error)};
  const p=parsed.data;
  const supabase=await createServerSupabaseClient();
  if(p.gym_id){const {data:gym,error}=await supabase.from("gyms").select("id").eq("id",p.gym_id).maybeSingle();if(error||!gym)return {status:"error",message:"Choose a valid gym or leave the ticket unassigned."};}
  const {data,error}=await supabase.from("platform_support_tickets").insert({gym_id:p.gym_id||null,subject:p.subject,description:p.description,requester_name:p.requester_name||null,requester_email:p.requester_email||null,priority:p.priority,status:"open",created_by:owner.id}).select("id").maybeSingle();
  if(error||!data)return {status:"error",message:"Ticket could not be saved. Confirm the support-ticket migration is installed."};
  revalidatePath("/platform/support");revalidatePath("/platform");
  return {status:"success",message:"Support ticket created.",recordId:data.id};
}

export async function updateSupportTicketAction(_previousState:FormActionState,formData:FormData):Promise<FormActionState>{
  const owner=await requirePlatformOwner();
  if(process.env.VERCEL_ENV!=="production")return {status:"error",message:"Support ticket updates are disabled in preview builds to protect production data."};
  const parsed=statusSchema.safeParse({ticket_id:get(formData,"ticket_id"),status:get(formData,"status"),internal_notes:get(formData,"internal_notes"),resolution_summary:get(formData,"resolution_summary")});
  if(!parsed.success)return {status:"error",message:"Review the status update and try again.",fieldErrors:fieldErrors(parsed.error)};
  const p=parsed.data,supabase=await createServerSupabaseClient();
  const {data:current,error:readError}=await supabase.from("platform_support_tickets").select("status").eq("id",p.ticket_id).maybeSingle();
  if(readError||!current)return {status:"error",message:"Ticket could not be found. Refresh the page and try again."};
  const transitions:Record<string,string[]>={open:["in_progress","waiting_on_customer","resolved","closed"],in_progress:["open","waiting_on_customer","resolved","closed"],waiting_on_customer:["open","in_progress","resolved","closed"],resolved:["open","closed"],closed:["open"]};
  if(current.status!==p.status&&!transitions[current.status]?.includes(p.status))return {status:"error",message:"That ticket status transition is not allowed. Refresh and select a valid next status."};
  const {data,error}=await supabase.from("platform_support_tickets").update({status:p.status,internal_notes:p.internal_notes||null,resolution_summary:p.resolution_summary||null,assigned_to:owner.id,resolved_at:["resolved","closed"].includes(p.status)?new Date().toISOString():null}).eq("id",p.ticket_id).eq("status",current.status).select("id").maybeSingle();
  if(error||!data)return {status:"error",message:"Ticket changed or could not be saved. Refresh and try again."};
  revalidatePath("/platform/support");
  return {status:"success",message:"Ticket updated.",recordId:data.id};
}
