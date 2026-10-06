import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { canAccessRole, workspacePath } from "@/lib/auth/policy";
import type { AppRole } from "@/lib/auth/policy";

export type { AppRole } from "@/lib/auth/policy";
export type Identity = { userId: string; displayName: string | null; role: AppRole; gymId?: string };

export const requireRole = cache(async (role: AppRole): Promise<Identity> => {
  if (!hasSupabaseConfig()) redirect("/login?reason=configuration");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("display_name, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !profile) redirect("/login?reason=access");

  if (!canAccessRole(profile.role, role)) {
    const { data: memberships } = profile.role === "gym_admin"
      ? await supabase.from("gym_user_memberships").select("gym_id").eq("user_id", user.id).eq("role", "gym_admin")
      : { data: [] };
    redirect(workspacePath(profile.role, memberships?.length ?? 0) || "/login?reason=access");
  }
  if (role === "platform_owner") return { userId: user.id, displayName: profile.display_name, role };

  const { data: memberships, error: membershipError } = await supabase
    .from("gym_user_memberships")
    .select("gym_id, role")
    .eq("user_id", user.id)
    .eq("role", "gym_admin");
  if (membershipError || memberships?.length !== 1) redirect("/login?reason=access");
  return { userId: user.id, displayName: profile.display_name, role: "gym_admin", gymId: memberships[0].gym_id };
});
