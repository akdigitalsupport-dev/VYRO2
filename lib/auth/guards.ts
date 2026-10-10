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
      ? await supabase.from("gym_user_memberships").select("gym_id").eq("user_id", user.id).eq("role", "gym_admin").limit(2)
      : { data: [] };
    redirect(workspacePath(profile.role, memberships?.length ?? 0) || "/unauthorized");
  }
  if (role === "platform_owner") return { userId: user.id, displayName: profile.display_name, role };

  const { data: memberships, error: membershipError } = await supabase
    .from("gym_user_memberships")
    .select("gym_id, role")
    .eq("user_id", user.id)
    .eq("role", "gym_admin")
    .limit(2);
  if (membershipError || memberships?.length !== 1) redirect("/unauthorized");
  return { userId: user.id, displayName: profile.display_name, role: "gym_admin", gymId: memberships[0].gym_id };
});

export async function requireGymAdminContext() {
  const identity = await requireRole("gym_admin");
  if (!identity.gymId) redirect("/unauthorized");
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  return { user, gymId: identity.gymId };
}

export async function requireGymAdmin() {
  return (await requireGymAdminContext()).user;
}

export async function requirePlatformOwner() {
  await requireRole("platform_owner");
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  return user;
}

export async function requireAuthenticatedUser() {
  if (!hasSupabaseConfig()) redirect("/login?reason=configuration");
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  return user;
}

export async function getAuthenticatedHomePath() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const { data: profile, error } = await supabase.from("user_profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (error || !profile) redirect("/unauthorized");
  if (profile.role === "platform_owner") return "/platform";
  if (profile.role === "gym_admin") {
    const { data: memberships, error: membershipError } = await supabase.from("gym_user_memberships")
      .select("gym_id").eq("user_id", user.id).eq("role", "gym_admin").limit(2);
    if (!membershipError && memberships?.length === 1 && memberships[0]?.gym_id) return "/gym/command-center";
  }
  redirect("/unauthorized");
}
