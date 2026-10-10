import "server-only";
import type { Identity } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InAppNotification = {
  id: string;
  audience: "gym" | "platform";
  notification_type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
};

export async function loadNotificationCenter(identity: Identity) {
  const supabase = await createSupabaseServerClient();
  const audience = identity.role === "platform_owner" ? "platform" : "gym";
  const settingsResult = audience === "gym"
    ? await supabase.from("gym_settings").select("timezone").eq("gym_id", identity.gymId!).maybeSingle()
    : await supabase.from("platform_settings").select("default_timezone").eq("id", 1).maybeSingle();
  const timezone = audience === "gym"
    ? (settingsResult.data as { timezone?: string } | null)?.timezone
    : (settingsResult.data as { default_timezone?: string } | null)?.default_timezone;
  let listQuery = supabase.from("notifications").select("id, audience, notification_type, title, message, entity_type, entity_id, is_read, created_at")
    .eq("recipient_user_id", identity.userId).eq("audience", audience);
  let unreadQuery = supabase.from("notifications").select("id", { count: "exact", head: true })
    .eq("recipient_user_id", identity.userId).eq("audience", audience).eq("is_read", false);
  if (audience === "gym") {
    listQuery = listQuery.eq("gym_id", identity.gymId!);
    unreadQuery = unreadQuery.eq("gym_id", identity.gymId!);
  }
  const [{ data }, { count }] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).limit(10),
    unreadQuery,
  ]);
  const { data: subscriptions } = audience === "gym"
    ? await supabase.from("push_subscriptions").select("id").eq("user_id", identity.userId)
      .eq("gym_id", identity.gymId!).is("disabled_at", null).limit(1)
    : { data: [] };
  return {
    notifications: (data || []) as InAppNotification[],
    unreadCount: count || 0,
    error: settingsResult.error,
    timeZone: timezone || "Asia/Kolkata",
    pushEnabled: Boolean(subscriptions?.length),
  };
}
