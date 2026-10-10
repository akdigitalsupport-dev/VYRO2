"use server";

import { revalidatePath } from "next/cache";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function markGymNotificationRead(id: string) {
  const { user, gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id).eq("recipient_user_id", user.id).eq("gym_id", gymId).eq("is_read", false);
  if (error) throw new Error("Notification could not be marked as read.");
  revalidatePath("/gym/command-center");
}

export async function markAllGymNotificationsRead() {
  const { user, gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_user_id", user.id).eq("gym_id", gymId).eq("is_read", false);
  if (error) throw new Error("Notifications could not be marked as read.");
  revalidatePath("/gym/command-center");
}
