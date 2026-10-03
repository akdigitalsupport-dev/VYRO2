"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/dates";

const optionalText = (max: number) => z.string().trim().max(max).optional();
const optionalDate = z.union([z.iso.date(), z.literal("")]).optional();

const memberSchema = z.object({
  member_code: z.string().trim().min(1).max(40),
  full_name: z.string().trim().min(1).max(160),
  phone: optionalText(40),
  email: z.union([z.email().max(254), z.literal("")]).optional(),
  gender: z.enum(["", "female", "male", "non_binary", "prefer_not_to_say"]).optional(),
  date_of_birth: optionalDate,
  address: optionalText(500),
  membership_plan_id: z.union([z.uuid(), z.literal("")]).optional(),
  membership_starts_on: optionalDate,
  membership_expires_on: optionalDate,
  notes: optionalText(2000),
});

export async function createMember(formData: FormData) {
  const identity = await requireRole("gym_admin");
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/members?error=validation");
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("members").insert({
    gym_id: identity.gymId!, member_code: input.member_code, full_name: input.full_name,
    phone: input.phone || null, email: input.email || null, gender: input.gender || null,
    date_of_birth: input.date_of_birth || null, address: input.address || null,
    membership_plan_id: input.membership_plan_id || null,
    membership_starts_on: input.membership_starts_on || null,
    membership_expires_on: input.membership_expires_on || null,
    notes: input.notes || null,
  }).select("id").single();
  if (error || !data) redirect("/gym/members?error=save");
  revalidatePath("/gym/members");
  redirect(`/gym/members/${data.id}`);
}

const memberUpdateSchema = z.object({
  id: z.uuid(),
  full_name: z.string().trim().min(1).max(160),
  phone: optionalText(40),
  email: z.union([z.email().max(254), z.literal("")]).optional(),
  address: optionalText(500),
  notes: optionalText(2000),
  status: z.enum(["active", "expiring", "expired", "paused"]),
  membership_starts_on: optionalDate,
  membership_expires_on: optionalDate,
});

export async function updateMember(formData: FormData) {
  const identity = await requireRole("gym_admin");
  const parsed = memberUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/members?error=validation");
  const { id, ...input } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("members").update({
    full_name: input.full_name, phone: input.phone || null, email: input.email || null,
    address: input.address || null, notes: input.notes || null, status: input.status, archived_at: null,
    membership_starts_on: input.membership_starts_on || null,
    membership_expires_on: input.membership_expires_on || null,
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
  redirect("/gym/members?saved=archived");
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

const planCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  duration_days: z.coerce.number().int().positive().max(3650),
  price: z.coerce.number().finite().nonnegative().max(10000000),
  description: optionalText(1000),
});

export async function createPlan(formData: FormData) {
  const identity = await requireRole("gym_admin");
  const parsed = planCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/plans?error=validation");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("membership_plans").insert({ ...parsed.data, gym_id: identity.gymId! });
  if (error) redirect("/gym/plans?error=save");
  revalidatePath("/gym/plans");
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
  const identity = await requireRole("gym_admin");
  const parsed = z.object({ member_code: z.string().trim().min(1).max(40), notes: optionalText(500) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/attendance?error=validation");
  const supabase = await createSupabaseServerClient();
  const { data: member } = await supabase.from("members").select("id, status")
    .eq("gym_id", identity.gymId!).eq("member_code", parsed.data.member_code).is("archived_at", null).maybeSingle();
  if (!member || member.status !== "active") redirect("/gym/attendance?error=member");
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("attendance_records").insert({
    gym_id: identity.gymId!, member_id: member.id, recorded_by: user?.id || null, notes: parsed.data.notes || null,
  });
  if (error) redirect("/gym/attendance?error=save");
  revalidatePath("/gym/attendance");
  revalidatePath("/gym/dashboard");
  redirect("/gym/attendance?saved=1");
}

export async function recordMemberPayment(formData: FormData) {
  const identity = await requireRole("gym_admin");
  const parsed = z.object({
    member_code: z.string().trim().min(1).max(40),
    amount: z.coerce.number().finite().positive().max(10000000),
    payment_method: z.enum(["cash", "upi", "card", "bank_transfer", "other"]),
    reference: optionalText(120),
    notes: optionalText(500),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/gym/payments?error=validation");
  const supabase = await createSupabaseServerClient();
  const { data: member } = await supabase.from("members").select("id")
    .eq("gym_id", identity.gymId!).eq("member_code", parsed.data.member_code).is("archived_at", null).maybeSingle();
  if (!member) redirect("/gym/payments?error=member");
  const { data: settings } = await supabase.from("gym_settings").select("currency").eq("gym_id", identity.gymId!).maybeSingle();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("member_payments").insert({
    gym_id: identity.gymId!, member_id: member.id, amount: parsed.data.amount,
    currency: settings?.currency || "INR",
    payment_method: parsed.data.payment_method, reference: parsed.data.reference || null,
    notes: parsed.data.notes || null, recorded_by: user?.id || null,
  });
  if (error) redirect("/gym/payments?error=save");
  revalidatePath("/gym/payments");
  revalidatePath("/gym/dashboard");
  redirect("/gym/payments?saved=1");
}
