"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/dates";
import {
  createMemberSchema,
  membershipAssignmentSchema,
  planSchema,
  updateMemberSchema,
  updatePlanSchema,
} from "@/lib/gym/validation.js";

const optionalText = (max: number) => z.string().trim().max(max).optional();

export async function createMember(formData: FormData) {
  await requireRole("gym_admin");
  const parsed = createMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/members?error=validation");
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_gym_member", {
    p_member_code: `VYRO-${randomUUID().slice(0, 8).toUpperCase()}`,
    p_full_name: input.full_name,
    p_phone: input.phone,
    p_email: input.email || null,
    p_gender: input.gender || null,
    p_date_of_birth: input.date_of_birth || null,
    p_address: input.address || null,
    p_joining_date: input.joining_date,
    p_notes: input.notes || null,
    p_membership_plan_id: input.membership_plan_id,
    p_membership_start_date: input.membership_start_date,
  });
  if (error || !data) redirect("/gym/members?error=save");
  revalidatePath("/gym/members");
  revalidatePath("/gym/dashboard");
  redirect(`/gym/members/${data}`);
}

export async function updateMember(formData: FormData) {
  const identity = await requireRole("gym_admin");
  const parsed = updateMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/members?error=validation");
  const { id, ...input } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("members").update({
    full_name: input.full_name, phone: input.phone || null, email: input.email || null,
    gender: input.gender || null, date_of_birth: input.date_of_birth || null,
    address: input.address || null, notes: input.notes || null, status: input.status,
  }).eq("id", id).eq("gym_id", identity.gymId!).select("id").maybeSingle();
  if (error || !data) redirect(`/gym/members/${id}?error=save`);
  revalidatePath("/gym/members");
  revalidatePath(`/gym/members/${id}`);
  redirect(`/gym/members/${id}?saved=1`);
}

const archiveSchema = z.object({ id: z.uuid() });
export async function archiveMember(formData: FormData) {
  const identity = await requireRole("gym_admin");
  const parsed = archiveSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/gym/members?error=validation");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("members").update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", parsed.data.id).eq("gym_id", identity.gymId!).is("archived_at", null);
  if (error) redirect(`/gym/members/${parsed.data.id}?error=save`);
  revalidatePath("/gym/members");
  revalidatePath("/gym/dashboard");
  redirect("/gym/members?saved=archived");
}

export async function addMemberMembership(formData: FormData) {
  await requireRole("gym_admin");
  const parsed = membershipAssignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/members?error=membership-validation");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_member_membership", {
    p_member_id: parsed.data.member_id,
    p_membership_plan_id: parsed.data.membership_plan_id,
    p_start_date: parsed.data.start_date,
  });
  if (error) redirect(`/gym/members/${parsed.data.member_id}?error=membership`);
  revalidatePath("/gym/members");
  revalidatePath(`/gym/members/${parsed.data.member_id}`);
  revalidatePath("/gym/dashboard");
  redirect(`/gym/members/${parsed.data.member_id}?saved=membership`);
}

export async function updateGymSettings(formData: FormData) {
  const identity = await requireRole("gym_admin");
  const parsed = z.object({ timezone: z.string().trim().min(1).max(80).refine(isValidTimeZone), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/settings?error=validation");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("gym_settings").update(parsed.data).eq("gym_id", identity.gymId!);
  if (error) redirect("/gym/settings?error=save");
  revalidatePath("/gym/settings");
  redirect("/gym/settings?saved=1");
}

export async function createPlan(formData: FormData) {
  const identity = await requireRole("gym_admin");
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/plans?error=validation");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("membership_plans").insert({ ...parsed.data, gym_id: identity.gymId! });
  if (error) redirect("/gym/plans?error=save");
  revalidatePath("/gym/plans");
  redirect("/gym/plans?saved=1");
}

export async function updatePlan(formData: FormData) {
  const identity = await requireRole("gym_admin");
  const parsed = updatePlanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/plans?error=validation");
  const { id, ...input } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("membership_plans").update({
    ...input,
    description: input.description || null,
  }).eq("id", id).eq("gym_id", identity.gymId!).select("id").maybeSingle();
  if (error || !data) redirect("/gym/plans?error=save");
  revalidatePath("/gym/plans");
  revalidatePath("/gym/members");
  redirect("/gym/plans?saved=1");
}

export async function setPlanActive(formData: FormData) {
  const identity = await requireRole("gym_admin");
  const parsed = z.object({ id: z.uuid(), is_active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/plans?error=validation");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("membership_plans").update({ is_active: parsed.data.is_active === "true" })
    .eq("id", parsed.data.id).eq("gym_id", identity.gymId!);
  if (error) redirect("/gym/plans?error=save");
  revalidatePath("/gym/plans");
  redirect("/gym/plans?saved=1");
}

export async function checkInMember(formData: FormData) {
  await requireRole("gym_admin");
  const parsed = z.object({ member_id: z.uuid(), notes: optionalText(500) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/attendance?error=validation");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_in_member", {
    p_member_id: parsed.data.member_id,
    p_notes: parsed.data.notes || null,
  });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result) redirect("/gym/attendance?error=save");
  if (result.outcome === "already_checked_in") redirect("/gym/attendance?error=duplicate");
  if (result.outcome === "member_unavailable") redirect("/gym/attendance?error=member");
  if (result.outcome === "membership_invalid") redirect("/gym/attendance?error=membership");
  if (result.outcome !== "checked_in") redirect("/gym/attendance?error=save");
  revalidatePath("/gym/attendance");
  revalidatePath("/gym/dashboard");
  revalidatePath(`/gym/members/${parsed.data.member_id}`);
  redirect("/gym/attendance?saved=1");
}

export async function recordMemberPayment(formData: FormData) {
  const identity = await requireRole("gym_admin");
  const decimalAmount = z.string().trim().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/)
    .refine((value) => !/^0(?:\.0{1,2})?$/.test(value));
  const parsed = z.object({
    member_code: z.string().trim().min(1).max(40),
    amount: decimalAmount,
    payment_method: z.enum(["cash", "upi", "card", "bank_transfer", "other"]),
    reference: optionalText(120),
    notes: optionalText(500),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/payments?error=validation");
  const supabase = await createSupabaseServerClient();
  const { data: member } = await supabase.from("members").select("id")
    .eq("gym_id", identity.gymId!).eq("member_code", parsed.data.member_code).is("archived_at", null).maybeSingle();
  if (!member) redirect("/gym/payments?error=member");
  const { error } = await supabase.rpc("create_member_payment", {
    p_member_id: member.id,
    p_amount: parsed.data.amount,
    p_payment_method: parsed.data.payment_method,
    p_reference: parsed.data.reference || null,
    p_notes: parsed.data.notes || null,
  });
  if (error) redirect("/gym/payments?error=save");
  revalidatePath("/gym/payments");
  revalidatePath("/gym/dashboard");
  redirect("/gym/payments?saved=1");
}

export async function updateMemberPaymentStatus(formData: FormData) {
  const identity = await requireRole("gym_admin");
  const parsed = z.object({
    payment_id: z.uuid(),
    status: z.enum(["completed", "failed", "refunded", "cancelled"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/payments?error=validation");
  const supabase = await createSupabaseServerClient();
  const { data: payment } = await supabase.from("member_payments").select("member_id")
    .eq("id", parsed.data.payment_id).eq("gym_id", identity.gymId!).maybeSingle();
  if (!payment) redirect("/gym/payments?error=payment");
  const { error } = await supabase.from("member_payments").update({ status: parsed.data.status })
    .eq("id", parsed.data.payment_id).eq("gym_id", identity.gymId!);
  if (error) redirect("/gym/payments?error=transition");
  revalidatePath("/gym/payments");
  revalidatePath("/gym/dashboard");
  revalidatePath(`/gym/members/${payment.member_id}`);
  redirect("/gym/payments?saved=updated");
}
