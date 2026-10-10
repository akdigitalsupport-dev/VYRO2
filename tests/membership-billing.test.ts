import { describe, expect, it } from "vitest";
import { billingStatusLabel, calculateMembershipBilling } from "@/lib/members/billing";

describe("membership billing calculations", () => {
  it.each([599, 1999, 3499])("shows a full %i payment as paid", (price) => {
    expect(calculateMembershipBilling(price, [{ amount: price, status: "completed" }])).toMatchObject({
      total: price,
      paid: price,
      outstanding: 0,
      status: "paid",
    });
  });

  it.each([
    [500, 3000, "partially_paid"],
    [1000, 2500, "partially_paid"],
    [3500, 0, "paid"],
  ] as const)("calculates total, paid, and due for a ₹3,500 membership", (paid, due, status) => {
    const result = calculateMembershipBilling("3500.00", [{ amount: String(paid), status: "completed" }]);
    expect(result).toMatchObject({ total: 3500, paid, outstanding: due, status });
  });

  it("adds multiple completed payments and ignores pending or refunded payments", () => {
    expect(calculateMembershipBilling(3500, [
      { amount: 500, status: "completed" },
      { amount: 1000, status: "completed" },
      { amount: 2000, status: "completed" },
      { amount: 100, status: "pending" },
      { amount: 50, status: "refunded" },
    ])).toMatchObject({ total: 3500, paid: 3500, outstanding: 0, status: "paid" });
  });

  it("treats no payment as unpaid without creating a zero-value payment", () => {
    expect(calculateMembershipBilling(3500, [])).toMatchObject({ total: 3500, paid: 0, outstanding: 3500, status: "unpaid" });
  });

  it("clamps old overpaid history at zero due and flags it instead of rewriting it", () => {
    expect(calculateMembershipBilling(3500, [{ amount: 5401, status: "completed" }])).toMatchObject({
      total: 3500,
      paid: 5401,
      outstanding: 0,
      status: "paid",
      hasHistoricalOverpayment: true,
    });
  });

  it("uses the saved membership price snapshot rather than current plan pricing", () => {
    expect(calculateMembershipBilling("3500.00", [{ amount: 500, status: "completed" }]).outstanding).toBe(3000);
  });

  it("keeps a new renewal period and its partial payment separate from the old balance", () => {
    const previous = calculateMembershipBilling("3500.00", [{ amount: 500, status: "completed" }]);
    const renewed = calculateMembershipBilling("1999.00", [{ amount: 500, status: "completed" }]);
    expect(previous.outstanding).toBe(3000);
    expect(renewed.outstanding).toBe(1499);
  });

  it("keeps the old price snapshot after the current plan price changes", () => {
    const oldMembershipSnapshot = "3500.00";
    const currentPlanPrice = "4000.00";
    expect(currentPlanPrice).toBe("4000.00");
    expect(calculateMembershipBilling(oldMembershipSnapshot, [{ amount: 500, status: "completed" }]).outstanding).toBe(3000);
  });

  it("labels billing status separately from membership state", () => {
    expect(billingStatusLabel("partially_paid")).toBe("Partially paid");
  });
});
