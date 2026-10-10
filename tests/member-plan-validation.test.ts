import { describe, expect, it } from "vitest";
import { createMemberSchema, editMemberSchema } from "@/lib/validation/members";
import { planSchema } from "@/lib/validation/plans";

const memberValues = {
  full_name: "  Ankush Example  ",
  phone: " 9876543210 ",
  email: "ankush@example.com",
  gender: "male",
  date_of_birth: "1995-04-12",
  address: "Pune",
  joining_date: "2026-10-01",
  notes: "",
  membership_plan_id: "d3f1baba-c047-49c3-8712-f818dad639f6",
  membership_start_date: "2026-10-01",
};

describe("member form validation", () => {
  it("normalizes optional values and accepts supported member details", () => {
    const result = createMemberSchema.safeParse(memberValues);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.full_name).toBe("Ankush Example");
      expect(result.data.notes).toBeNull();
      expect(result.data.membership_plan_id).toBe(memberValues.membership_plan_id);
    }
  });

  it("rejects invalid email, impossible dates, and membership before joining", () => {
    const invalid = createMemberSchema.safeParse({
      ...memberValues,
      email: "not-an-email",
      date_of_birth: "2026-02-30",
      membership_start_date: "2026-09-30",
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues.map((issue) => issue.path[0])).toContain("email");
      expect(invalid.error.issues.map((issue) => issue.path[0])).toContain("date_of_birth");
      expect(invalid.error.issues.map((issue) => issue.path[0])).toContain("membership_start_date");
    }
  });

  it("rejects an empty member name when editing", () => {
    const result = editMemberSchema.safeParse({ full_name: "  ", phone: "", email: "", gender: "", date_of_birth: "", address: "", notes: "" });
    expect(result.success).toBe(false);
  });
});

describe("membership plan form validation", () => {
  it("accepts free plans and prices with two decimal places", () => {
    const result = planSchema.safeParse({ name: "  Monthly  ", duration_days: "30", price: "1499.50", description: "One month", is_active: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Monthly");
      expect(result.data.duration_days).toBe(30);
      expect(result.data.price).toBe(1499.5);
    }

    expect(planSchema.safeParse({ name: "Free", duration_days: "1", price: "0", description: "", is_active: false }).success).toBe(true);
  });

  it("rejects non-positive duration, negative prices, and precision beyond cents", () => {
    const base = { name: "Standard", duration_days: "30", price: "100", description: "", is_active: true };
    expect(planSchema.safeParse({ ...base, duration_days: "0" }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, duration_days: "30.5" }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, price: "-1" }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, price: "10.999" }).success).toBe(false);
  });
});
