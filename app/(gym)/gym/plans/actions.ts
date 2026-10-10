"use server";

import { revalidatePath } from "next/cache";
import { requireGymAdminContext } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { planSchema } from "@/lib/validation/plans";

function textValue(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

function fieldErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

export async function savePlanAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { gymId } = await requireGymAdminContext();
  const planId = textValue(formData, "plan_id");
  const isActive = formData.get("is_active") === "on";
  const parsed = planSchema.safeParse({
    name: textValue(formData, "name"),
    duration_days: textValue(formData, "duration_days"),
    price: textValue(formData, "price"),
    description: textValue(formData, "description"),
    is_active: isActive,
  });

  if (!parsed.success) {
    return { status: "error", message: "Review the highlighted fields and try again.", fieldErrors: fieldErrors(parsed.error) };
  }

  if (planId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) {
    return { status: "error", message: "This plan could not be found." };
  }

  const supabase = await createServerSupabaseClient();
  const { name, duration_days, price, description } = parsed.data;
  const result = planId
    ? await supabase
        .from("membership_plans")
        .update({ name, duration_days, price, description, is_active: parsed.data.is_active })
        .eq("id", planId)
        .eq("gym_id", gymId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("membership_plans")
        .insert({ gym_id: gymId, name, duration_days, price, description, is_active: parsed.data.is_active })
        .select("id")
        .single();

  if (result.error?.code === "23505") {
    return { status: "error", message: "A plan with this name already exists for your gym.", fieldErrors: { name: "Choose a different plan name." } };
  }
  if (result.error || !result.data) {
    return { status: "error", message: "The plan could not be saved. Please try again." };
  }

  revalidatePath("/gym/plans");
  return { status: "success", message: planId ? "Plan updated." : "Plan created.", recordId: result.data.id };
}

export async function setPlanActiveAction(planId: string, isActive: boolean): Promise<FormActionState> {
  const { gymId } = await requireGymAdminContext();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(planId)) {
    return { status: "error", message: "This plan could not be found." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("membership_plans")
    .update({ is_active: isActive })
    .eq("id", planId)
    .eq("gym_id", gymId)
    .select("id")
    .maybeSingle();

  if (error || !data) return { status: "error", message: "The plan status could not be changed. Refresh and try again." };
  revalidatePath("/gym/plans");
  revalidatePath("/gym/members/new");
  revalidatePath("/gym/members");
  return { status: "success", message: isActive ? "Plan activated for new memberships." : "Plan deactivated. Existing membership history is preserved." };
}
