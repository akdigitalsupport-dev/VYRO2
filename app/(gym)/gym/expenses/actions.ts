"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGymAdminContext } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const categories = ["rent", "electricity", "equipment", "maintenance", "salary", "marketing", "other"] as const;
const expenseSchema = z.object({
  expense_date: z.iso.date(), category: z.enum(categories),
  amount: z.coerce.number().finite().positive().max(9999999999.99),
  description: z.string().trim().min(1).max(240), reference: z.string().trim().max(120), notes: z.string().trim().max(1000),
});
function text(form: FormData, key: string) { const value = form.get(key); return typeof value === "string" ? value : ""; }
export async function saveExpenseAction(_state: FormActionState, form: FormData): Promise<FormActionState> {
  const { gymId, user } = await requireGymAdminContext();
  const id = text(form, "id");
  const parsed = expenseSchema.safeParse({ expense_date: text(form, "expense_date"), category: text(form, "category"), amount: text(form, "amount"), description: text(form, "description"), reference: text(form, "reference"), notes: text(form, "notes") });
  if (!parsed.success) return { status: "error", message: "Check the expense details and try again.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const supabase = await createServerSupabaseClient();
  const data = { ...parsed.data, reference: parsed.data.reference || null, notes: parsed.data.notes || null };
  const result = id
    ? await supabase.from("gym_expenses").update(data).eq("id", id).eq("gym_id", gymId).is("archived_at", null).select("id").maybeSingle()
    : await supabase.from("gym_expenses").insert({ ...data, gym_id: gymId, recorded_by: user.id }).select("id").single();
  if (result.error || !result.data) {
    console.error("Expense save failed", { code: result.error?.code, message: result.error?.message });
    return { status: "error", message: "The expense could not be saved. Check the values and try again." };
  }
  revalidatePath("/gym/expenses"); revalidatePath("/gym/command-center"); revalidatePath("/gym/reports");
  return { status: "success", message: id ? "Expense updated." : "Expense recorded.", recordId: result.data.id };
}
export async function archiveExpenseAction(id: string): Promise<FormActionState> {
  const { gymId } = await requireGymAdminContext();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: "error", message: "Expense not found." };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("gym_expenses").update({ archived_at: new Date().toISOString() }).eq("id", id).eq("gym_id", gymId).is("archived_at", null).select("id").maybeSingle();
  if (error || !data) return { status: "error", message: "The expense could not be archived." };
  revalidatePath("/gym/expenses"); revalidatePath("/gym/command-center"); revalidatePath("/gym/reports");
  return { status: "success", message: "Expense archived." };
}
