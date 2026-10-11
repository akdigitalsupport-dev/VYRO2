"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGymAdminContext } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const leadSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40),
  email: z.union([z.literal(""), z.email().max(254)]),
  source: z.string().trim().max(80),
  notes: z.string().trim().max(1000),
});

const statuses = ["new", "contacted", "trial", "converted", "lost"] as const;

function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function fieldErrors(error: z.ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

export async function createLeadAction(_state: FormActionState, form: FormData): Promise<FormActionState> {
  const { gymId, user } = await requireGymAdminContext();
  const parsed = leadSchema.safeParse({
    name: field(form, "name"),
    phone: field(form, "phone"),
    email: field(form, "email"),
    source: field(form, "source"),
    notes: field(form, "notes"),
  });
  if (!parsed.success) return { status: "error", message: "Review the lead details and try again.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("gym_leads").insert({
    gym_id: gymId,
    created_by: user.id,
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    source: parsed.data.source || null,
    notes: parsed.data.notes || null,
  }).select("id").single();
  if (error || !data) {
    console.error("Lead creation failed", { code: error?.code });
    return { status: "error", message: "The lead could not be saved. Refresh and try again." };
  }

  revalidatePath("/gym/leads");
  revalidatePath("/gym/command-center");
  return { status: "success", message: "Lead added." };
}

export async function updateLeadStatusAction(_state: FormActionState, form: FormData): Promise<FormActionState> {
  const { gymId } = await requireGymAdminContext();
  const id = field(form, "id");
  const status = field(form, "status");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    || !statuses.includes(status as (typeof statuses)[number])) {
    return { status: "error", message: "Lead or status is invalid." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("gym_leads").update({ status })
    .eq("id", id).eq("gym_id", gymId).select("id").maybeSingle();
  if (error || !data) return { status: "error", message: "The lead status could not be updated." };

  revalidatePath("/gym/leads");
  revalidatePath("/gym/command-center");
  return { status: "success", message: "Lead status updated." };
}
