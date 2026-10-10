"use server";

import { z } from "zod";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).refine((value) => new URL(value).protocol === "https:"),
  keys: z.object({
    p256dh: z.string().min(20).max(300),
    auth: z.string().min(10).max(200),
  }),
});

export async function saveGymPushSubscription(input: unknown): Promise<{ ok: boolean; message?: string }> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The browser subscription is invalid." };

  const { user, gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: user.id,
    gym_id: gymId,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth_key: parsed.data.keys.auth,
    disabled_at: null,
  }, { onConflict: "endpoint" });
  if (error) {
    console.error("Gym push subscription save failed", { code: error.code });
    return { ok: false, message: "This device could not be registered for notifications." };
  }
  return { ok: true };
}

export async function removeGymPushSubscription(endpoint: string): Promise<{ ok: boolean; message?: string }> {
  const parsed = z.string().url().max(2048).refine((value) => new URL(value).protocol === "https:").safeParse(endpoint);
  if (!parsed.success) return { ok: false, message: "The browser subscription is invalid." };

  const { user, gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("push_subscriptions").delete()
    .eq("user_id", user.id).eq("gym_id", gymId).eq("endpoint", parsed.data);
  if (error) {
    console.error("Gym push subscription removal failed", { code: error.code });
    return { ok: false, message: "This device could not be removed from notifications." };
  }
  return { ok: true };
}
