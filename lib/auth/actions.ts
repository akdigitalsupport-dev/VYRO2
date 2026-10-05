"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { workspacePath } from "@/lib/auth/policy";

const signInSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export type LoginState = { error?: string; configurationMissing?: boolean };

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  if (!hasSupabaseConfig()) return { configurationMissing: true };
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "We couldn't sign you in with those details." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "We couldn't verify your session. Please try again." };
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("user_id", user.id).maybeSingle();
  const { data: memberships } = profile?.role === "gym_admin"
    ? await supabase.from("gym_user_memberships").select("gym_id").eq("user_id", user.id).eq("role", "gym_admin")
    : { data: [] };
  const destination = workspacePath(profile?.role, memberships?.length ?? 0);
  if (destination) redirect(destination);
  await supabase.auth.signOut();
  return { error: "This account does not have an active VYRO workspace." };
}

export async function setInitialPassword(formData: FormData) {
  const parsed = z.object({ password: z.string().min(12).max(128), confirm: z.string().min(12).max(128) })
    .refine((data) => data.password === data.confirm).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/auth/set-password?error=validation");
  if (!hasSupabaseConfig()) redirect("/login?reason=configuration");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("user_id", user.id).maybeSingle();
  const { data: memberships } = await supabase.from("gym_user_memberships").select("gym_id").eq("user_id", user.id).eq("role", "gym_admin");
  if (profile?.role !== "gym_admin" || memberships?.length !== 1) {
    await supabase.auth.signOut();
    redirect("/login?reason=access");
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) redirect("/auth/set-password?error=save");
  redirect("/gym/dashboard");
}

export async function signOut() {
  if (hasSupabaseConfig()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
