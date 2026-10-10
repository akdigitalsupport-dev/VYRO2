"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGymAdminContext } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";
const schema = z.object({ name: z.string().trim().min(1).max(120), phone: z.string().trim().max(40), specialization: z.string().trim().max(120), notes: z.string().trim().max(1000), status: z.enum(["active", "inactive"]) });
const val = (f: FormData, k: string) => typeof f.get(k) === "string" ? String(f.get(k)) : "";
export async function saveTrainerAction(_state: FormActionState, form: FormData): Promise<FormActionState> {
  const { gymId } = await requireGymAdminContext();
  const id = val(form, "id"); const parsed = schema.safeParse({ name: val(form, "name"), phone: val(form, "phone"), specialization: val(form, "specialization"), notes: val(form, "notes"), status: val(form, "status") });
  if (!parsed.success) return { status: "error", message: "Review the trainer details and try again." };
  const supabase = await createServerSupabaseClient(); const data = { ...parsed.data, phone: parsed.data.phone || null, specialization: parsed.data.specialization || null, notes: parsed.data.notes || null };
  const result = id ? await supabase.from("trainers").update(data).eq("id", id).eq("gym_id", gymId).select("id").maybeSingle() : await supabase.from("trainers").insert({ ...data, gym_id: gymId }).select("id").single();
  if (result.error || !result.data) { console.error("Trainer save failed", { code: result.error?.code }); return { status: "error", message: "Trainer details could not be saved." }; }
  revalidatePath("/gym/trainers"); return { status: "success", message: id ? "Trainer updated." : "Trainer added." };
}
