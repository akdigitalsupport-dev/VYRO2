"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGymAdminContext } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";
const schema = z.object({ member_code: z.string().trim().min(3).max(40), notes: z.string().trim().max(500) });
export async function checkInMemberAction(_state: FormActionState, form: FormData): Promise<FormActionState> {
 const { gymId } = await requireGymAdminContext(); const raw = (k: string) => typeof form.get(k) === "string" ? String(form.get(k)) : "";
 const parsed = schema.safeParse({ member_code: raw("member_code"), notes: raw("notes") }); if (!parsed.success) return { status: "error", message: "Enter a valid member code." };
 const supabase = await createServerSupabaseClient(); const { data: member, error: findError } = await supabase.from("members").select("id").eq("gym_id", gymId).eq("member_code", parsed.data.member_code).maybeSingle();
 if (findError || !member) return { status: "error", message: "No member with that code was found in this gym." };
 const { data, error } = await supabase.rpc("check_in_member", { p_member_id: member.id, p_notes: parsed.data.notes || null }); const result = Array.isArray(data) ? data[0] : null;
 if (error) { console.error("Attendance check-in failed", { code: error.code }); return { status: "error", message: "Check-in failed. Try again." }; }
 if (result?.outcome === "already_checked_in") return { status: "error", message: "This member is already checked in today." };
 if (result?.outcome === "membership_invalid") return { status: "error", message: "This member does not have a membership valid today." };
 if (result?.outcome !== "checked_in") return { status: "error", message: "This member is inactive or unavailable for check-in." };
 revalidatePath("/gym/attendance"); revalidatePath("/gym/command-center"); return { status: "success", message: "Member checked in." };
}
