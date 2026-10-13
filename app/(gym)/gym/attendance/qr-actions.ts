"use server";

import { revalidatePath } from "next/cache";
import { requireGymAdminContext } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function generateGymCheckinCodesAction(): Promise<FormActionState> {
  await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("generate_gym_checkin_codes");
  if (error) {
    console.error("Gym check-in code generation failed", { code: error.code });
    if (error.code === "23514") {
      return { status: "error", message: "There are not enough four-digit IDs for all active members. No codes were changed." };
    }
    return { status: "error", message: "Member IDs could not be generated. Please try again." };
  }
  const result = Array.isArray(data) ? data[0] : null;
  const assigned = Number(result?.assigned_count ?? 0);
  revalidatePath("/gym/attendance");
  revalidatePath("/gym/attendance/codes");
  return {
    status: "success",
    message: assigned > 0
      ? `Four-digit IDs generated for ${assigned} active member${assigned === 1 ? "" : "s"}.`
      : "All active members already have a four-digit ID.",
  };
}
