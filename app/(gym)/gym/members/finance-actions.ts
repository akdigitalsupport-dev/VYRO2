"use server";

import { revalidatePath } from "next/cache";
import { requireGymAdminContext } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { calculateMembershipBilling } from "@/lib/members/billing";
import { formatInr } from "@/lib/money";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dateInTimeZone, membershipAssignmentSchema, memberPaymentDetailsSchema, memberPaymentSchema, membershipPaymentAmountSchema, parseMembershipPlanPrice } from "@/lib/validation/member-finance";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

function fieldErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function assignMembershipAndRecordPaymentAction(
  memberId: string,
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { gymId } = await requireGymAdminContext();
  if (!isUuid(memberId)) return { status: "error", message: "This member could not be found." };

  const parsed = membershipAssignmentSchema.safeParse({
    membership_plan_id: value(formData, "membership_plan_id"),
    start_date: value(formData, "start_date"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Review the membership details and try again.", fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: member, error: memberError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("members").select("id, joining_date, status, archived_at").eq("id", memberId).eq("gym_id", gymId).maybeSingle(),
    supabase.from("gym_settings").select("timezone, currency").eq("gym_id", gymId).maybeSingle(),
  ]);
  if (memberError || !member) return { status: "error", message: "The member could not be found in this gym." };
  if (member.status === "archived" || member.archived_at) return { status: "error", message: "Archived members cannot receive a new membership." };
  if (settingsError) return { status: "error", message: "Gym payment settings could not be verified. Refresh and try again." };
  if (parsed.data.start_date < member.joining_date) {
    return { status: "error", message: "Membership cannot start before the member’s joining date.", fieldErrors: { start_date: "Choose the joining date or a later date." } };
  }

  const { data: plan, error: planError } = await supabase
    .from("membership_plans")
    .select("id, price")
    .eq("id", parsed.data.membership_plan_id)
    .eq("gym_id", gymId)
    .eq("is_active", true)
    .maybeSingle();
  if (planError || !plan) {
    return { status: "error", message: "That active plan is unavailable for this gym. Refresh and choose another plan." };
  }

  const planPrice = parseMembershipPlanPrice(plan.price);
  if (planPrice === null) return { status: "error", message: "The selected plan has an invalid saved price. Correct the plan before continuing." };

  const timeZone = settings?.timezone ?? "Asia/Kolkata";
  const amountResult = membershipPaymentAmountSchema.safeParse(value(formData, "payment_amount"));
  if (!amountResult.success) {
    return { status: "error", message: "Enter a valid payment amount, or enter 0 to pay later.", fieldErrors: { payment_amount: amountResult.error.issues[0]?.message ?? "Enter a valid payment amount." } };
  }
  const paymentAmount = amountResult.data;
  if (paymentAmount > planPrice) {
    return { status: "error", message: `Payment exceeds the outstanding balance of ${formatInr(planPrice, { fractionDigits: 2 })}.`, fieldErrors: { payment_amount: "Enter no more than the membership price." } };
  }
  let paymentDetails: ReturnType<typeof memberPaymentDetailsSchema.safeParse> | null = null;
  if (paymentAmount > 0) {
    paymentDetails = memberPaymentDetailsSchema.safeParse({
      payment_date: value(formData, "payment_date"),
      payment_method: value(formData, "payment_method"),
      reference: value(formData, "reference"),
      notes: value(formData, "notes"),
    });
    if (!paymentDetails.success) {
      return { status: "error", message: "Review the payment details and try again.", fieldErrors: fieldErrors(paymentDetails.error) };
    }
    if (paymentDetails.data.payment_date > dateInTimeZone(new Date(), timeZone)) {
      return { status: "error", message: "Payment date cannot be in the future.", fieldErrors: { payment_date: "Choose today or an earlier date." } };
    }
  }
  const { data: rows, error: rpcError } = await supabase.rpc("assign_membership_with_payment", {
    p_member_id: memberId, p_membership_plan_id: plan.id, p_start_date: parsed.data.start_date,
    p_payment_amount: paymentAmount,
    p_payment_date: paymentDetails?.success ? paymentDetails.data.payment_date : null,
    p_payment_method: paymentDetails?.success ? paymentDetails.data.payment_method : null,
    p_reference: paymentDetails?.success ? paymentDetails.data.reference || null : null,
    p_notes: paymentDetails?.success ? paymentDetails.data.notes || null : null,
  });
  const result = Array.isArray(rows) ? rows[0] : null;
  if (rpcError || !result?.membership_id || (paymentAmount > 0 && !result.payment_id)) {
    console.error("Atomic membership renewal failed", { code: rpcError?.code, message: rpcError?.message });
    if (rpcError?.message?.startsWith("PAYMENT_EXCEEDS_OUTSTANDING:")) {
      const dbOutstanding = Number(rpcError.message.slice("PAYMENT_EXCEEDS_OUTSTANDING:".length));
      return { status: "error", message: `Payment exceeds the outstanding balance of ${formatInr(Number.isFinite(dbOutstanding) ? dbOutstanding : planPrice, { fractionDigits: 2 })}.`, fieldErrors: { payment_amount: "Enter no more than the remaining balance." } };
    }
    if (rpcError?.code === "23P01") return { status: "error", message: "Those dates overlap existing membership history. Choose a start date after the previous period." };
    if (rpcError?.code === "42501") return { status: "error", message: "The member or plan is no longer available in this gym." };
    return { status: "error", message: "Membership and payment could not be saved together. No partial renewal was created." };
  }
  revalidatePath(`/gym/members/${memberId}`);
  revalidatePath("/gym/members");
  revalidatePath("/gym/members/billing");
  revalidatePath("/gym/members/memberships");
  revalidatePath("/gym/command-center");
  revalidatePath("/gym/reports");
  return { status: "success", message: paymentAmount > 0 ? "Membership period added and payment recorded." : "Membership period added. Payment can be recorded later.", recordId: result.membership_id };
}

export async function recordMemberPaymentAction(
  memberId: string,
  membershipId: string,
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { gymId } = await requireGymAdminContext();
  if (!isUuid(memberId) || !isUuid(membershipId)) return { status: "error", message: "This member or membership could not be found." };

  const parsed = memberPaymentSchema.safeParse({
    amount: value(formData, "amount"),
    payment_date: value(formData, "payment_date"),
    payment_method: value(formData, "payment_method"),
    reference: value(formData, "reference"),
    notes: value(formData, "notes"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Review the payment details and try again.", fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: member, error: memberError }, { data: settings, error: settingsError }, { data: membership, error: membershipError }, { data: payments, error: paymentsError }] = await Promise.all([
    supabase.from("members").select("id, status, archived_at").eq("id", memberId).eq("gym_id", gymId).maybeSingle(),
    supabase.from("gym_settings").select("timezone, currency").eq("gym_id", gymId).maybeSingle(),
    supabase.from("member_memberships").select("id, price_snapshot, status").eq("id", membershipId).eq("member_id", memberId).eq("gym_id", gymId).maybeSingle(),
    supabase.from("member_payments").select("amount, status").eq("membership_id", membershipId).eq("member_id", memberId).eq("gym_id", gymId).eq("status", "completed"),
  ]);
  if (memberError || !member) return { status: "error", message: "The member could not be found in this gym." };
  if (member.status === "archived" || member.archived_at) return { status: "error", message: "Archived members cannot receive a new payment." };
  if (settingsError) return { status: "error", message: "Gym settings could not be verified. Refresh and try again." };
  if (membershipError || !membership || membership.status === "cancelled") return { status: "error", message: "That membership is unavailable for this member." };
  if (paymentsError) return { status: "error", message: "The membership balance could not be verified. Refresh and try again." };

  const today = dateInTimeZone(new Date(), settings?.timezone ?? "Asia/Kolkata");
  if (parsed.data.payment_date > today) {
    return { status: "error", message: "Payment date cannot be in the future.", fieldErrors: { payment_date: "Choose today or an earlier date." } };
  }

  const balance = calculateMembershipBilling(membership.price_snapshot, payments ?? []);
  if (parsed.data.amount > balance.outstanding) {
    return { status: "error", message: `Payment exceeds the outstanding balance of ${formatInr(balance.outstanding, { fractionDigits: 2 })}.`, fieldErrors: { amount: "Enter no more than the remaining balance." } };
  }

  const { data: paymentIdResult, error } = await supabase.rpc("record_member_membership_payment", {
    p_member_id: memberId,
    p_membership_id: membershipId,
    p_amount: parsed.data.amount,
    p_payment_date: parsed.data.payment_date,
    p_payment_method: parsed.data.payment_method,
    p_reference: parsed.data.reference,
    p_notes: parsed.data.notes,
  });
  const paymentId = typeof paymentIdResult === "string" ? paymentIdResult : null;
  if (error || !paymentId) {
    if (error?.message?.startsWith("PAYMENT_EXCEEDS_OUTSTANDING:")) {
      const dbOutstanding = Number(error.message.slice("PAYMENT_EXCEEDS_OUTSTANDING:".length));
      return { status: "error", message: `Payment exceeds the outstanding balance of ${formatInr(Number.isFinite(dbOutstanding) ? dbOutstanding : balance.outstanding, { fractionDigits: 2 })}.`, fieldErrors: { amount: "Enter no more than the remaining balance." } };
    }
    if (error?.code === "42501" || error?.code === "23503") return { status: "error", message: "The member or membership is no longer available in this gym." };
    if (error?.code === "22023") return { status: "error", message: "Payment date cannot be in the future or the payment details are invalid." };
    if (error?.code === "23514") return { status: "error", message: "Amount must be positive and use no more than two decimal places." };
    return { status: "error", message: "The payment could not be recorded. Please try again." };
  }

  revalidatePath(`/gym/members/${memberId}`);
  revalidatePath("/gym/members");
  revalidatePath("/gym/members/billing");
  revalidatePath("/gym/command-center");
  return { status: "success", message: `Payment recorded. Outstanding balance: ${formatInr(balance.outstanding - parsed.data.amount, { fractionDigits: 2 })}.`, recordId: paymentId };
}
