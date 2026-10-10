import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { dateAtLocalNoonIso } from "@/lib/validation/member-finance";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export async function insertManualMemberPayment(
  supabase: ServerSupabaseClient,
  values: {
    gymId: string;
    memberId: string;
    membershipId: string | null;
    amount: number;
    currency: string;
    timeZone: string;
    paymentDate: string;
    paymentMethod: "cash" | "upi" | "bank_transfer" | "card" | "other";
    reference: string | null;
    notes: string | null;
  },
) {
  const paymentDate = dateAtLocalNoonIso(values.paymentDate, values.timeZone);
  if (!paymentDate) return { data: null, error: { code: "22023" } };

  return supabase
    .from("member_payments")
    .insert({
      gym_id: values.gymId,
      member_id: values.memberId,
      membership_id: values.membershipId,
      amount: values.amount,
      currency: values.currency,
      payment_method: values.paymentMethod,
      reference: values.reference,
      notes: values.notes,
      payment_date: paymentDate,
    })
    .select("id")
    .maybeSingle();
}
