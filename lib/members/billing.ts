export type BillingStatus = "unpaid" | "partially_paid" | "paid";

export type MembershipBilling = {
  total: number;
  paid: number;
  outstanding: number;
  status: BillingStatus;
  hasHistoricalOverpayment: boolean;
};

function cents(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

export function calculateMembershipBilling(
  priceSnapshot: number | string,
  completedPayments: ReadonlyArray<{ amount: number | string; status: string }>,
): MembershipBilling {
  const totalCents = Math.max(0, cents(Number(priceSnapshot)));
  const paidCents = completedPayments.reduce((sum, payment) => {
    if (payment.status !== "completed") return sum;
    return sum + Math.max(0, cents(Number(payment.amount)));
  }, 0);
  const outstandingCents = Math.max(0, totalCents - paidCents);
  return {
    total: totalCents / 100,
    paid: paidCents / 100,
    outstanding: outstandingCents / 100,
    status: paidCents === 0 ? "unpaid" : paidCents >= totalCents ? "paid" : "partially_paid",
    hasHistoricalOverpayment: paidCents > totalCents,
  };
}

export function billingStatusLabel(status: BillingStatus) {
  if (status === "partially_paid") return "Partially paid";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
