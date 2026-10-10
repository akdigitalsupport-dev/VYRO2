"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGymAdminContext } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";
const schema = z.object({ name: z.string().trim().min(1).max(160), owner_name: z.string().trim().max(120), phone: z.string().trim().max(40), email: z.union([z.email(), z.literal("")]), address: z.string().trim().max(1000), currency: z.string().regex(/^[A-Z]{3}$/), timezone: z.string().min(1).max(80) });
export async function saveGymSettingsAction(_state: FormActionState, form: FormData): Promise<FormActionState> {
 const { gymId } = await requireGymAdminContext(); const value = (k: string) => typeof form.get(k) === "string" ? String(form.get(k)) : "";
 const parsed = schema.safeParse({ name: value("name"), owner_name: value("owner_name"), phone: value("phone"), email: value("email"), address: value("address"), currency: value("currency"), timezone: value("timezone") });
 if (!parsed.success) return { status: "error", message: "Review gym name, contact, currency, and timezone." };
 try { new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone }); } catch { return { status: "error", message: "Choose a valid timezone." }; }
 const logo = form.get("logo"); const removeLogo = value("remove_logo") === "on";
 let newPath: string | null = null;
 if (logo instanceof File && logo.size) {
  if (!["image/jpeg", "image/png"].includes(logo.type) || logo.size > 2 * 1024 * 1024) return { status: "error", message: "Logo must be a JPG or PNG up to 2 MB." };
 }
 const supabase = await createServerSupabaseClient(); const { data: gym } = await supabase.from("gyms").select("logo_path").eq("id", gymId).maybeSingle();
 if (!gym) return { status: "error", message: "Gym profile could not be loaded." };
 if (logo instanceof File && logo.size) {
  const extension = logo.type === "image/png" ? "png" : "jpg"; newPath = `${gymId}/logo/logo-${randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("vyro-gym-logos").upload(newPath, logo, { contentType: logo.type, upsert: false, cacheControl: "3600" });
  if (error) { console.error("Gym logo upload failed", { code: error.name }); return { status: "error", message: "The logo could not be uploaded." }; }
 } else newPath = removeLogo ? null : gym.logo_path;
 const { error } = await supabase.rpc("update_gym_profile", { p_name: parsed.data.name, p_owner_name: parsed.data.owner_name || null, p_phone: parsed.data.phone || null, p_email: parsed.data.email || null, p_address: parsed.data.address || null, p_currency: parsed.data.currency, p_timezone: parsed.data.timezone, p_logo_path: newPath });
 if (error) {
  if (newPath && newPath !== gym.logo_path) await supabase.storage.from("vyro-gym-logos").remove([newPath]);
  console.error("Gym profile update failed", { code: error.code }); return { status: "error", message: "Gym settings could not be saved. Review the values and retry." };
 }
 if (gym.logo_path && gym.logo_path !== newPath) { const { error: cleanupError } = await supabase.storage.from("vyro-gym-logos").remove([gym.logo_path]); if (cleanupError) console.error("Old gym logo cleanup failed", { code: cleanupError.name }); }
 revalidatePath("/gym/settings"); revalidatePath("/gym/command-center"); return { status: "success", message: "Gym settings saved." };
}
export async function saveNotificationPreferencesAction(_state: FormActionState, form: FormData): Promise<FormActionState> {
 await requireGymAdminContext(); const supabase = await createServerSupabaseClient();
 const events = ["membership_expiring", "membership_expiry_reminder", "membership_expired", "payment_recorded", "payment_refunded", "member_created", "membership_created", "expense_recorded"];
 for (const event of events) { const { error } = await supabase.rpc("set_notification_preference", { p_event_type: event, p_enabled: form.get(event) === "on" }); if (error) return { status: "error", message: "Notification preferences could not be saved." }; }
 revalidatePath("/gym/settings"); return { status: "success", message: "Notification preferences saved." };
}

export async function saveRegistrationFeeSettingsAction(_state: FormActionState, form: FormData): Promise<FormActionState> {
 await requireGymAdminContext();
 const rawAmount = typeof form.get("registration_fee_amount") === "string" ? String(form.get("registration_fee_amount")) : "";
 const amount = Number(rawAmount);
 const enabled = form.get("registration_fee_enabled") === "on";
 if (!rawAmount.trim() || !Number.isFinite(amount) || amount < 0 || amount > 9999999999.99 || Math.round(amount * 100) !== amount * 100 || (enabled && amount === 0)) {
  return { status: "error", message: "Enter a valid fee with up to two decimal places. An enabled fee must be greater than zero." };
 }
 const supabase = await createServerSupabaseClient();
 const { error } = await supabase.rpc("update_gym_registration_settings", { p_amount: amount, p_enabled: enabled });
 if (error) {
  console.error("Registration fee settings update failed", { code: error.code });
  return { status: "error", message: "Registration fee settings could not be saved." };
 }
 revalidatePath("/gym/settings"); revalidatePath("/gym/members/new");
 return { status: "success", message: "Registration fee settings saved." };
}
