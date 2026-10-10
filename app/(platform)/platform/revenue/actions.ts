"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformOwner } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const pendingPaymentSchema = z.object({
  subscription_id: z.string().uuid("Choose a valid subscription."),
  amount: z.coerce.number()
    .positive("Payment amount must be greater than zero.")
    .max(9999999999.99, "Payment amount is too large.")
    .refine((amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001, "Use no more than two decimal places."),
  reference: z.string().trim().max(200, "Reference must be 200 characters or fewer.").optional().default(""),
});

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

function errors(error: z.ZodError) {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field && !result[field]) result[field] = issue.message;
  }
  return result;
}

export async function createPendingPlatformPaymentAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  await requirePlatformOwner();
  if (process.env.VERCEL_ENV !== "production") {
    return { status: "error", message: "Payment ledger changes are disabled in preview builds to protect production data." };
  }

  const parsed = pendingPaymentSchema.safeParse({
    subscription_id: value(formData, "subscription_id"),
    amount: value(formData, "amount"),
    reference: value(formData, "reference"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Review the payment fields and try again.", fieldErrors: errors(parsed.error) };
  }

  const supabase = await createServerSupabaseClient();
  const { data: subscription, error: subscriptionError } = await supabase
    .from("platform_subscriptions")
    .select("id,gym_id,currency,status,amount")
    .eq("id", parsed.data.subscription_id)
    .maybeSingle();

  if (subscriptionError || !subscription) {
    return { status: "error", message: "The selected subscription could not be verified. Refresh and try again." };
  }
  if (!["trial", "active", "past_due", "suspended"].includes(subscription.status)) {
    return { status: "error", message: "Only a subscription with a configured paid price can have a manual payment record. Free trials without a paid conversion have no payment due." };
  }
  if (!Number.isFinite(Number(subscription.amount)) || Number(subscription.amount) <= 0) {
    return { status: "error", message: "This subscription does not have a configured positive price. Configure pricing before recording a payment." };
  }

  const { data: existingPayments, error: existingPaymentsError } = await supabase
    .from("platform_subscription_payments")
    .select("amount,status,currency")
    .eq("subscription_id", subscription.id)
    .in("status", ["pending", "completed"]);
  if (existingPaymentsError) {
    return { status: "error", message: "Existing payment records could not be verified. Refresh the ledger and try again." };
  }
  const committedAmount = (existingPayments ?? [])
    .filter((payment) => payment.currency.trim() === subscription.currency.trim())
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const remainingAmount = Math.round((Number(subscription.amount) - committedAmount) * 100) / 100;
  if (remainingAmount <= 0) {
    return { status: "error", message: "This subscription's configured amount is already covered by pending and completed records." };
  }
  if (parsed.data.amount > remainingAmount + 0.000001) {
    return {
      status: "error",
      message: `This payment exceeds the remaining amount of ${new Intl.NumberFormat("en-IN", { style: "currency", currency: subscription.currency.trim(), maximumFractionDigits: 2 }).format(remainingAmount)}.`,
      fieldErrors: { amount: "Payment amount cannot exceed the remaining subscription amount." },
    };
  }

  const { data: record, error } = await supabase
    .from("platform_subscription_payments")
    .insert({
      subscription_id: subscription.id,
      gym_id: subscription.gym_id,
      amount: parsed.data.amount,
      currency: subscription.currency,
      reference: parsed.data.reference || null,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error || !record) {
    console.error("Platform pending payment record failed", { code: error?.code });
    return { status: "error", message: "The pending payment record could not be saved. No payment was marked as received." };
  }

  revalidatePath("/platform/revenue/payments");
  revalidatePath("/platform/revenue/outstanding");
  revalidatePath("/platform/revenue");
  return { status: "success", message: "Pending payment record created. It will not count as revenue until you verify receipt and mark it completed.", recordId: record.id };
}

export async function markPlatformPaymentReceivedAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  await requirePlatformOwner();
  if (process.env.VERCEL_ENV !== "production") {
    return { status: "error", message: "Payment reconciliation is disabled in preview builds to protect production data." };
  }
  const paymentId = value(formData, "payment_id");
  if (!z.string().uuid().safeParse(paymentId).success) {
    return { status: "error", message: "This payment record is invalid. Refresh and try again." };
  }
  if (value(formData, "confirmed") !== "yes") {
    return { status: "error", message: "Confirm that the payment was actually received before marking it completed." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("platform_subscription_payments")
    .update({ status: "completed" })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { status: "error", message: "The payment could not be reconciled. It may have changed already; refresh the ledger and check its current status." };
  }

  revalidatePath("/platform/revenue/payments");
  revalidatePath("/platform/revenue/outstanding");
  revalidatePath("/platform/revenue");
  return { status: "success", message: "Payment marked completed after confirmation of receipt." };
}
