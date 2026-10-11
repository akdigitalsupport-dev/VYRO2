"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "next/navigation";
import { requireGymAdminContext } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const emailSchema = z.object({ email: z.email().trim().max(254) });
const passwordSchema = z.object({
  password: z.string().min(12).max(128),
  confirm: z.string().min(12).max(128),
}).refine((value) => value.password === value.confirm, {
  path: ["confirm"],
  message: "Passwords do not match.",
});

type AccountContext = { userId: string; email: string | null; settingsPath: "/platform/settings" | "/gym/settings" };

/** The role and user id always come from the authenticated server session and profile. */
async function requireAccountContext(): Promise<AccountContext> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: profile, error: profileError } = await supabase.from("user_profiles")
    .select("role").eq("user_id", user.id).maybeSingle();
  if (profileError || !profile) redirect("/unauthorized");

  if (profile.role === "platform_owner") {
    return { userId: user.id, email: user.email ?? null, settingsPath: "/platform/settings" };
  }
  if (profile.role === "gym_admin") {
    const gymContext = await requireGymAdminContext();
    if (gymContext.user.id !== user.id) redirect("/unauthorized");
    return { userId: user.id, email: user.email ?? null, settingsPath: "/gym/settings" };
  }
  redirect("/unauthorized");
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function requestAccountEmailChangeAction(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const account = await requireAccountContext();
  const parsed = emailSchema.safeParse({ email: readString(formData, "email").trim() });
  if (!parsed.success) return { status: "error", message: "Enter a valid email address.", fieldErrors: { email: "Enter a valid email address." } };
  if (account.email?.toLowerCase() === parsed.data.email.toLowerCase()) {
    return { status: "error", message: "Enter an email address different from your current one.", fieldErrors: { email: "This is already your current email." } };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ email: parsed.data.email });
  if (error) {
    return { status: "error", message: "Email change could not be started. Check that email changes and confirmation email delivery are enabled for this project; password changes remain available." };
  }
  revalidatePath(account.settingsPath);
  return { status: "success", message: "Email change requested. Follow the confirmation instructions sent by Supabase; your current email remains active until confirmation." };
}

export async function changeAccountPasswordAction(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const account = await requireAccountContext();
  const parsed = passwordSchema.safeParse({ password: readString(formData, "password"), confirm: readString(formData, "confirm") });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((issue) => issue.path[0] === "confirm" && issue.message === "Passwords do not match.");
    return {
      status: "error",
      message: mismatch ? "The new passwords do not match." : "Use a password between 12 and 128 characters.",
      fieldErrors: mismatch ? { confirm: "Passwords do not match." } : { password: "Use 12 to 128 characters.", confirm: "Use 12 to 128 characters." },
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: "Password could not be changed. Your current session remains active; try again or sign in again if the session has expired." };
  revalidatePath(account.settingsPath);
  return { status: "success", message: "Password changed. Your current session remains active." };
}
