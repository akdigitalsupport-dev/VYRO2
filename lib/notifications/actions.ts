"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function authorizeAudience(value: FormDataEntryValue | null) {
  const audience = z.enum(["gym", "platform"]).safeParse(value);
  if (!audience.success) return null;
  const identity = await requireRole(audience.data === "platform" ? "platform_owner" : "gym_admin");
  return { identity, audience: audience.data };
}

export async function markNotificationRead(formData: FormData) {
  const access = await authorizeAudience(formData.get("audience"));
  const id = z.uuid().safeParse(formData.get("id"));
  if (!access || !id.success) return;
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id.data).eq("recipient_user_id", access.identity.userId).eq("audience", access.audience).eq("is_read", false);
  if (access.audience === "gym") query = query.eq("gym_id", access.identity.gymId!);
  await query;
  revalidatePath(access.audience === "platform" ? "/platform" : "/gym", "layout");
}

export async function markAllNotificationsRead(formData: FormData) {
  const access = await authorizeAudience(formData.get("audience"));
  if (!access) return;
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_user_id", access.identity.userId).eq("audience", access.audience).eq("is_read", false);
  if (access.audience === "gym") query = query.eq("gym_id", access.identity.gymId!);
  await query;
  revalidatePath(access.audience === "platform" ? "/platform" : "/gym", "layout");
}

export async function saveNotificationPreferences(formData: FormData) {
  const access = await authorizeAudience(formData.get("audience"));
  if (!access) return;
  const events = access.audience === "gym"
    ? ["membership_expiring", "membership_expiry_reminder", "membership_expired", "payment_recorded", "payment_refunded"]
    : ["gym_subscription_expiring", "gym_subscription_expired", "platform_payment_recorded", "platform_payment_refunded"];
  const supabase = await createSupabaseServerClient();
  for (const eventType of events) {
    const enabled = formData.get(eventType) === "on";
    const { error } = await supabase.rpc("set_notification_preference", { p_event_type: eventType, p_enabled: enabled });
    if (error) redirect(access.audience === "platform" ? "/platform/settings?error=preferences" : "/gym/settings?error=preferences");
  }
  const path = access.audience === "platform" ? "/platform/settings" : "/gym/settings";
  revalidatePath(path);
  redirect(`${path}?saved=notifications`);
}
