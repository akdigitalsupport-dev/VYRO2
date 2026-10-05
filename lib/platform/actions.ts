"use server";

import "server-only";

import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/dates";

const gymSchema = z.object({
  name: z.string().trim().min(2).max(160),
  owner_name: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.email().max(254), z.literal("")]).optional(),
  address: z.string().trim().max(500).optional(),
});

export async function createGym(formData: FormData) {
  await requireRole("platform_owner");
  const parsed = gymSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/platform/gyms?error=validation");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("gyms").insert({
    name: parsed.data.name,
    owner_name: parsed.data.owner_name || null,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    address: parsed.data.address || null,
  }).select("id").single();
  if (error || !data) redirect("/platform/gyms?error=save");
  revalidatePath("/platform/gyms");
  redirect(`/platform/gyms/${data.id}`);
}

const statusSchema = z.object({ gymId: z.uuid(), status: z.enum(["active", "expiring", "expired", "suspended"]) });

export async function updateGymStatus(formData: FormData) {
  await requireRole("platform_owner");
  const parsed = statusSchema.safeParse({ gymId: formData.get("gymId"), status: formData.get("status") });
  if (!parsed.success) redirect("/platform/gyms?error=validation");
  const supabase = await createSupabaseServerClient();
  const { data: gym } = await supabase.from("gyms").select("status").eq("id", parsed.data.gymId).maybeSingle();
  if (!gym) redirect("/platform/gyms?error=save");
  const { error } = await supabase.from("gyms").update({ status: parsed.data.status }).eq("id", parsed.data.gymId);
  if (error) redirect(`/platform/gyms/${parsed.data.gymId}?error=save`);
  revalidatePath("/platform/gyms");
  revalidatePath(`/platform/gyms/${parsed.data.gymId}`);
  redirect(`/platform/gyms/${parsed.data.gymId}?saved=1`);
}

const platformSettingsSchema = z.object({
  brand_name: z.string().trim().min(1).max(120),
  support_email: z.union([z.email().max(254), z.literal("")]),
  default_currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  default_timezone: z.string().trim().min(1).max(80).refine(isValidTimeZone),
});

export async function savePlatformSettings(formData: FormData) {
  await requireRole("platform_owner");
  const parsed = platformSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/platform/settings?error=validation");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("platform_settings").update({
    brand_name: parsed.data.brand_name,
    support_email: parsed.data.support_email || null,
    default_currency: parsed.data.default_currency,
    default_timezone: parsed.data.default_timezone,
  }).eq("id", 1);
  if (error) redirect("/platform/settings?error=save");
  revalidatePath("/platform/settings");
  redirect("/platform/settings?saved=1");
}

const gymUpdateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2).max(160),
  owner_name: z.string().trim().max(160),
  phone: z.string().trim().max(40),
  email: z.union([z.email().max(254), z.literal("")]),
  address: z.string().trim().max(500),
});

export async function updateGym(formData: FormData) {
  await requireRole("platform_owner");
  const parsed = gymUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/platform/gyms?error=validation");
  const { id, ...input } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("gyms").update({
    name: input.name, owner_name: input.owner_name || null, phone: input.phone || null,
    email: input.email || null, address: input.address || null,
  }).eq("id", id);
  if (error) redirect(`/platform/gyms/${id}?error=save`);
  revalidatePath("/platform/gyms");
  revalidatePath(`/platform/gyms/${id}`);
  redirect(`/platform/gyms/${id}?saved=profile`);
}

const subscriptionSchema = z.object({
  gym_id: z.uuid(),
  subscription_id: z.union([z.uuid(), z.literal("")]),
  plan_name: z.string().trim().min(1).max(120),
  amount: z.string().trim().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  billing_period: z.enum(["monthly", "quarterly", "yearly", "custom"]),
  starts_on: z.iso.date(),
  expires_on: z.iso.date(),
  status: z.enum(["trial", "active", "past_due", "expired", "suspended", "cancelled"]),
});

export async function saveGymSubscription(formData: FormData) {
  await requireRole("platform_owner");
  const parsed = subscriptionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.expires_on < parsed.data.starts_on) redirect("/platform/subscriptions?error=validation");
  const { subscription_id, ...input } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const query = subscription_id
    ? supabase.from("platform_subscriptions").update(input).eq("id", subscription_id).eq("gym_id", input.gym_id)
    : supabase.from("platform_subscriptions").insert(input);
  const { error } = await query;
  if (error) redirect(`/platform/gyms/${input.gym_id}?error=subscription`);
  revalidatePath("/platform/dashboard");
  revalidatePath("/platform/subscriptions");
  revalidatePath("/platform/renewals");
  redirect(`/platform/gyms/${input.gym_id}?saved=subscription`);
}

const platformPaymentSchema = z.object({
  gym_id: z.uuid(),
  subscription_id: z.uuid(),
  amount: z.string().trim().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/)
    .refine((value) => !/^0(?:\.0{1,2})?$/.test(value)),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  reference: z.string().trim().max(120),
});

export async function recordPlatformPayment(formData: FormData) {
  await requireRole("platform_owner");
  const parsed = platformPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/platform/revenue?error=validation");
  const supabase = await createSupabaseServerClient();
  const { data: subscription } = await supabase.from("platform_subscriptions").select("id")
    .eq("id", parsed.data.subscription_id).eq("gym_id", parsed.data.gym_id).maybeSingle();
  if (!subscription) redirect(`/platform/gyms/${parsed.data.gym_id}?error=subscription`);
  const { error } = await supabase.from("platform_subscription_payments").insert({
    gym_id: parsed.data.gym_id, subscription_id: parsed.data.subscription_id,
    amount: parsed.data.amount, currency: parsed.data.currency,
    reference: parsed.data.reference || null,
  });
  if (error) redirect(`/platform/gyms/${parsed.data.gym_id}?error=payment`);
  revalidatePath("/platform/dashboard");
  revalidatePath("/platform/revenue");
  redirect(`/platform/gyms/${parsed.data.gym_id}?saved=payment`);
}

export async function updatePlatformPaymentStatus(formData: FormData) {
  await requireRole("platform_owner");
  const parsed = z.object({
    payment_id: z.uuid(),
    status: z.enum(["completed", "failed", "refunded", "cancelled"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/platform/revenue?error=validation");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("platform_subscription_payments")
    .update({ status: parsed.data.status }).eq("id", parsed.data.payment_id).select("id").maybeSingle();
  if (error || !data) redirect("/platform/revenue?error=transition");
  revalidatePath("/platform/dashboard");
  revalidatePath("/platform/revenue");
  redirect("/platform/revenue?saved=updated");
}

const gymAdminInviteSchema = z.object({
  gym_id: z.uuid(),
  email: z.email().max(254),
  display_name: z.string().trim().min(1).max(160),
});

export async function inviteGymAdmin(formData: FormData) {
  await requireRole("platform_owner");
  const parsed = gymAdminInviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/platform/gyms?error=invite-validation");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) redirect(`/platform/gyms/${parsed.data.gym_id}?error=invite-config`);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { display_name: parsed.data.display_name },
    redirectTo: new URL("/auth/callback?next=/auth/set-password", baseUrl).toString(),
  });
  if (error || !data.user) redirect(`/platform/gyms/${parsed.data.gym_id}?error=invite`);

  const supabase = await createSupabaseServerClient();
  const { error: provisionError } = await supabase.rpc("provision_gym_admin", {
    target_gym_id: parsed.data.gym_id,
    target_user_id: data.user.id,
  });
  if (provisionError) redirect(`/platform/gyms/${parsed.data.gym_id}?error=provision`);
  revalidatePath(`/platform/gyms/${parsed.data.gym_id}`);
  redirect(`/platform/gyms/${parsed.data.gym_id}?saved=invite`);
}
