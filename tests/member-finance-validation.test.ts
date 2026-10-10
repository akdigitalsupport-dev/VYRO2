import { describe, expect, it } from "vitest";
import {
  addDaysToIsoDate,
  dateAtLocalNoonIso,
  dateInTimeZone,
  deriveMembershipStatus,
  isCalendarDate,
  memberPaymentSchema,
  memberPaymentStatusLabel,
  membershipAssignmentSchema,
  parseMembershipPlanPrice,
} from "@/lib/validation/member-finance";

describe("membership date and status rules", () => {
  it("accepts real calendar dates and rejects impossible dates", () => {
    expect(isCalendarDate("2026-10-08")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026/10/08")).toBe(false);
    expect(membershipAssignmentSchema.safeParse({
      membership_plan_id: "d3f1baba-c047-49c3-8712-f818dad639f6",
      start_date: "2026-10-08",
    }).success).toBe(true);
  });

  it("derives active, upcoming, expired, and cancelled from dates and stored cancellation", () => {
    expect(deriveMembershipStatus("active", "2026-10-01", "2026-10-08", "2026-10-08")).toBe("active");
    expect(deriveMembershipStatus("active", "2026-10-09", "2026-11-08", "2026-10-08")).toBe("upcoming");
    expect(deriveMembershipStatus("active", "2026-09-01", "2026-10-07", "2026-10-08")).toBe("expired");
    expect(deriveMembershipStatus("cancelled", "2026-10-09", "2026-11-08", "2026-10-08")).toBe("cancelled");
  });

  it("calculates membership end dates using the existing start plus duration rule", () => {
    expect(addDaysToIsoDate("2026-10-08", 30)).toBe("2026-11-07");
  });

  it("converts a payment date to a timestamp that keeps the same gym-local calendar date", () => {
    const timestamp = dateAtLocalNoonIso("2026-10-08", "Asia/Kolkata");
    expect(timestamp).not.toBeNull();
    expect(dateInTimeZone(new Date(timestamp!), "Asia/Kolkata")).toBe("2026-10-08");
    expect(dateAtLocalNoonIso("2026-02-30", "Asia/Kolkata")).toBeNull();
  });
});

describe("manual payment validation", () => {
  const validPayment = {
    amount: "1499.50",
    payment_date: "2026-10-08",
    payment_method: "upi",
    reference: "UPI-104",
    notes: "October payment",
  };

  it("accepts valid amount, date, method, reference, and notes", () => {
    const result = memberPaymentSchema.safeParse(validPayment);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBe(1499.5);
  });

  it("rejects zero/negative amounts and more than two decimal places", () => {
    expect(memberPaymentSchema.safeParse({ ...validPayment, amount: "0" }).success).toBe(false);
    expect(memberPaymentSchema.safeParse({ ...validPayment, amount: "-1" }).success).toBe(false);
    expect(memberPaymentSchema.safeParse({ ...validPayment, amount: "10.999" }).success).toBe(false);
  });

  it("rejects invalid dates and methods", () => {
    expect(memberPaymentSchema.safeParse({ ...validPayment, payment_date: "2026-02-30" }).success).toBe(false);
    expect(memberPaymentSchema.safeParse({ ...validPayment, payment_method: "crypto" }).success).toBe(false);
  });

  it("enforces reference and notes length limits", () => {
    expect(memberPaymentSchema.safeParse({ ...validPayment, reference: "r".repeat(121) }).success).toBe(false);
    expect(memberPaymentSchema.safeParse({ ...validPayment, notes: "n".repeat(501) }).success).toBe(false);
  });

  it("uses Paid as the consistent completed-payment label", () => {
    expect(memberPaymentStatusLabel("completed")).toBe("Paid");
  });
});

describe("database membership plan prices", () => {
  it("parses numeric database values and rejects null, formatted, or excessive precision", () => {
    expect(parseMembershipPlanPrice(1999)).toBe(1999);
    expect(parseMembershipPlanPrice("1999.00")).toBe(1999);
    expect(parseMembershipPlanPrice("0.00")).toBe(0);
    expect(parseMembershipPlanPrice(null)).toBeNull();
    expect(parseMembershipPlanPrice("₹1,999")).toBeNull();
    expect(parseMembershipPlanPrice("1999.001")).toBeNull();
  });
});
