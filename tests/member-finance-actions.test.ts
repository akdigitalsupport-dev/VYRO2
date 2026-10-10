import { beforeEach, describe, expect, it, vi } from "vitest";
import { assignMembershipAndRecordPaymentAction, recordMemberPaymentAction } from "@/app/(gym)/gym/members/finance-actions";
import { dateInTimeZone, addDaysToIsoDate } from "@/lib/validation/member-finance";
import { initialFormActionState } from "@/lib/forms";

const { mockRequireGymAdminContext, mockCreateServerSupabaseClient, mockRevalidatePath } = vi.hoisted(() => ({
  mockRequireGymAdminContext: vi.fn(),
  mockCreateServerSupabaseClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireGymAdminContext: mockRequireGymAdminContext }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mockCreateServerSupabaseClient }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

const gymId = "e4d63723-afce-4ec0-bac0-bc98f07555d5";
const memberId = "540e2568-cf64-45f7-9476-667bbd8241e2";
const planId = "d3f1baba-c047-49c3-8712-f818dad639f6";
const membershipId = "efae10cb-ed56-4421-b9c3-9dbe961d9c57";
const paymentId = "324f3144-cf59-4d51-b90b-24da954e7cdd";

type MockResult = { data: unknown; error: { code?: string } | null };

function builder(result: MockResult, awaitedResult = result) {
  const value = {
    inserted: undefined as unknown,
    select: vi.fn(() => value),
    eq: vi.fn(() => value),
    order: vi.fn(() => value),
    insert: vi.fn((row: unknown) => {
      value.inserted = row;
      return value;
    }),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: MockResult) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(awaitedResult).then(resolve, reject),
  };
  return value;
}

function configureSupabase({
  memberResult = { data: { id: memberId, joining_date: "2026-01-01" }, error: null },
  planResult = { data: { id: planId, price: 1499 }, error: null },
  settingsResult = { data: { timezone: "Asia/Kolkata", currency: "INR" }, error: null },
  membershipResult = { data: { id: membershipId, price_snapshot: 1499 }, error: null },
  paymentRowsResult = { data: [], error: null },
  rpcResult = { data: [{ membership_id: membershipId, payment_id: paymentId }], error: null },
}: {
  memberResult?: MockResult;
  planResult?: MockResult;
  settingsResult?: MockResult;
  membershipResult?: MockResult;
  paymentRowsResult?: MockResult;
  rpcResult?: MockResult;
} = {}) {
  const builders = {
    members: builder(memberResult),
    membership_plans: builder(planResult),
    gym_settings: builder(settingsResult),
    member_memberships: builder(membershipResult),
    member_payments: builder(paymentRowsResult, paymentRowsResult),
  };
  const supabase = {
    from: vi.fn((table: keyof typeof builders) => builders[table]),
    rpc: vi.fn().mockResolvedValue(rpcResult),
  };
  mockCreateServerSupabaseClient.mockResolvedValue(supabase);
  return { supabase, builders };
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function membershipAndPaymentForm(startDate: string, paymentDate = dateInTimeZone(new Date(), "Asia/Kolkata"), paymentAmount = "1499") {
  return form({
    membership_plan_id: planId,
    start_date: startDate,
    payment_amount: paymentAmount,
    payment_date: paymentDate,
    payment_method: "upi",
    reference: "UPI-104",
    notes: "Enrollment payment",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireGymAdminContext.mockResolvedValue({ gymId, user: { id: "authenticated-user" } });
});

describe("membership and payment server action", () => {
  it("renews with a partial payment and keeps the snapshot amount out of browser arguments", async () => {
    const { supabase } = configureSupabase({ planResult: { data: { id: planId, price: "1999.00" }, error: null } });
    const result = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm("2026-11-08", undefined, "500"));
    expect(result.status).toBe("success");
    expect(supabase.rpc).toHaveBeenCalledWith("assign_membership_with_payment", expect.objectContaining({ p_payment_amount: 500, p_membership_plan_id: planId }));
    expect(supabase.rpc.mock.calls[0][1]).not.toHaveProperty("gym_id");
    expect(supabase.rpc.mock.calls[0][1]).not.toHaveProperty("price");
  });

  it("supports changing the next plan with a partial payment through the same append-only RPC", async () => {
    const { supabase } = configureSupabase({ planResult: { data: { id: planId, price: "1999.00" }, error: null } });
    const result = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm("2026-11-08", undefined, "500"));
    expect(result.status).toBe("success");
    expect(supabase.rpc).toHaveBeenCalledWith("assign_membership_with_payment", expect.objectContaining({ p_payment_amount: 500 }));
    expect(supabase.from).not.toHaveBeenCalledWith("member_memberships", "update");
    expect(supabase.from).not.toHaveBeenCalledWith("member_memberships", "delete");
  });

  it("rejects a renewal payment above the plan price before writing any history", async () => {
    const { supabase } = configureSupabase({ planResult: { data: { id: planId, price: "1999.00" }, error: null } });
    const result = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm("2026-11-08", undefined, "2000"));
    expect(result.status).toBe("error");
    expect(result.message).toContain("₹1,999.00");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("creates renewal and paid payment through one atomic RPC", async () => {
    const { supabase, builders } = configureSupabase();
    const result = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm("2026-10-08"));

    expect(result.status).toBe("success");
    expect(supabase.rpc).toHaveBeenCalledWith("assign_membership_with_payment", {
      p_member_id: memberId,
      p_membership_plan_id: planId,
      p_start_date: "2026-10-08",
      p_payment_amount: 1499,
      p_payment_date: expect.any(String),
      p_payment_method: "upi",
      p_reference: "UPI-104",
      p_notes: "Enrollment payment",
    });
    expect(builders.member_payments.insert).not.toHaveBeenCalled();
  });

  it("resolves a 1999 plan price from the authorized gym and records exactly 1999", async () => {
    const { supabase, builders } = configureSupabase({
      planResult: { data: { id: planId, price: "1999.00" }, error: null },
      membershipResult: { data: { id: membershipId, price_snapshot: "1999.00" }, error: null },
    });
    const result = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm("2026-10-08", undefined, "1999"));

    expect(result.status).toBe("success");
    expect(builders.membership_plans.select).toHaveBeenCalledWith("id, price");
    expect(builders.membership_plans.eq).toHaveBeenCalledWith("id", planId);
    expect(builders.membership_plans.eq).toHaveBeenCalledWith("gym_id", gymId);
    expect(builders.membership_plans.eq).toHaveBeenCalledWith("is_active", true);
    expect(builders.member_payments.insert).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith("assign_membership_with_payment", expect.objectContaining({ p_membership_plan_id: planId, p_payment_amount: 1999 }));
    expect(supabase.rpc.mock.calls[0][1]).not.toHaveProperty("price");
    expect(supabase.rpc.mock.calls[0][1]).not.toHaveProperty("gym_id");
  });

  it.each(["599.00", "1999.00", "3499.00"])(
    "accepts the database price %s when optional payment fields are blank",
    async (price) => {
      const { supabase } = configureSupabase({
        planResult: { data: { id: planId, price }, error: null },
      });
      const values = Object.fromEntries(membershipAndPaymentForm("2026-10-08", undefined, price).entries());
      const result = await assignMembershipAndRecordPaymentAction(
        memberId,
        initialFormActionState,
        form({ ...values, reference: "", notes: "" }),
      );

      expect(result.status).toBe("success");
      expect(supabase.rpc).toHaveBeenCalledWith(
        "assign_membership_with_payment",
        expect.objectContaining({ p_reference: null, p_notes: null }),
      );
      expect(result.message).not.toContain("price cannot be validated");
    },
  );

  it("associates a future-start membership payment with the newly created term", async () => {
    const today = dateInTimeZone(new Date(), "Asia/Kolkata");
    const futureStart = addDaysToIsoDate(today, 20);
    const { builders, supabase } = configureSupabase();
    const result = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm(futureStart));

    expect(result.status).toBe("success");
    expect(builders.member_payments.insert).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith("assign_membership_with_payment", expect.objectContaining({ p_start_date: futureStart, p_payment_amount: 1499 }));
  });

  it("rejects cross-gym members and plans before changing membership history", async () => {
    const memberScoped = configureSupabase({ memberResult: { data: null, error: null } });
    const memberDenied = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm("2026-10-08"));
    expect(memberDenied.status).toBe("error");
    expect(memberScoped.supabase.rpc).not.toHaveBeenCalled();

    const planScoped = configureSupabase({ planResult: { data: null, error: null } });
    const planDenied = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm("2026-10-08"));
    expect(planDenied.status).toBe("error");
    expect(planScoped.supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects archived members before creating a membership or payment", async () => {
    const archivedForMembership = configureSupabase({ memberResult: { data: { id: memberId, joining_date: "2026-01-01", status: "archived", archived_at: "2026-10-08T00:00:00Z" }, error: null } });
    const assignment = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm("2026-10-08"));
    expect(assignment.status).toBe("error");
    expect(assignment.message).toContain("Archived members");
    expect(archivedForMembership.supabase.rpc).not.toHaveBeenCalled();

    const archivedForPayment = configureSupabase({ memberResult: { data: { id: memberId, status: "archived", archived_at: "2026-10-08T00:00:00Z" }, error: null } });
    const today = dateInTimeZone(new Date(), "Asia/Kolkata");
    const payment = await recordMemberPaymentAction(memberId, membershipId, initialFormActionState, form({
      amount: "100", payment_date: today, payment_method: "cash", reference: "", notes: "",
    }));
    expect(payment.status).toBe("error");
    expect(payment.message).toContain("Archived members");
    expect(archivedForPayment.supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects a future payment date and a zero-price plan before membership creation", async () => {
    const today = dateInTimeZone(new Date(), "Asia/Kolkata");
    const futurePayment = configureSupabase();
    const futureResult = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm("2026-10-08", addDaysToIsoDate(today, 1)));
    expect(futureResult.status).toBe("error");
    expect(futurePayment.supabase.rpc).not.toHaveBeenCalled();

    const freePlan = configureSupabase({
      planResult: { data: { id: planId, price: "0.00" }, error: null },
      membershipResult: { data: { id: membershipId, price_snapshot: "0.00" }, error: null },
      rpcResult: { data: [{ membership_id: membershipId, payment_id: null }], error: null },
    });
    const freeResult = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm("2026-10-08", dateInTimeZone(new Date(), "Asia/Kolkata"), "0"));
    expect(freeResult.status).toBe("success");
    expect(freePlan.supabase.rpc).toHaveBeenCalledWith("assign_membership_with_payment", expect.objectContaining({ p_payment_amount: 0 }));
    expect(freePlan.builders.member_payments.insert).not.toHaveBeenCalled();
  });

  it("preserves renewal history by appending through the existing assignment RPC", async () => {
    const { supabase } = configureSupabase();
    const result = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm("2026-11-08"));

    expect(result.status).toBe("success");
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("assign_membership_with_payment", expect.objectContaining({
      p_member_id: memberId,
      p_start_date: "2026-11-08",
    }));
    expect(supabase.from).not.toHaveBeenCalledWith("member_memberships", "update");
    expect(supabase.from).not.toHaveBeenCalledWith("member_memberships", "delete");
  });

  it("reports atomic renewal failure without claiming a partial membership or payment", async () => {
    const { supabase } = configureSupabase({ rpcResult: { data: null, error: { code: "42501" } } });
    const result = await assignMembershipAndRecordPaymentAction(memberId, initialFormActionState, membershipAndPaymentForm("2026-10-08"));
    expect(result.status).toBe("error");
    expect(result.recordId).toBeUndefined();
    expect(result.message).toContain("member or plan is no longer available");
    expect(supabase.rpc).toHaveBeenCalledWith("assign_membership_with_payment", expect.any(Object));
  });
});

describe("manual payment server action", () => {
  it("validates member ownership and records a payment against the explicitly selected membership", async () => {
    const { supabase, builders } = configureSupabase({
      membershipResult: { data: { id: membershipId, price_snapshot: 2500, status: "active" }, error: null },
      rpcResult: { data: paymentId, error: null },
    });
    const today = dateInTimeZone(new Date(), "Asia/Kolkata");
    const result = await recordMemberPaymentAction(memberId, membershipId, initialFormActionState, form({
      amount: "1499.50",
      payment_date: today,
      payment_method: "upi",
      reference: "UPI-104",
      notes: "Manual receipt",
    }));

    expect(result.status).toBe("success");
    expect(supabase.rpc).toHaveBeenCalledWith("record_member_membership_payment", expect.objectContaining({ p_member_id: memberId, p_membership_id: membershipId, p_amount: 1499.5 }));
    expect(supabase.rpc.mock.calls[0][1]).not.toHaveProperty("gym_id");
    expect(builders.member_payments.insert).not.toHaveBeenCalled();
  });

  it("associates an early payment with the explicitly chosen upcoming period", async () => {
    const today = dateInTimeZone(new Date(), "Asia/Kolkata");
    const { builders, supabase } = configureSupabase({
      membershipResult: { data: { id: membershipId, price_snapshot: 1499, status: "active" }, error: null },
      rpcResult: { data: paymentId, error: null },
    });
    await recordMemberPaymentAction(memberId, membershipId, initialFormActionState, form({
      amount: "100",
      payment_date: today,
      payment_method: "cash",
      reference: "",
      notes: "",
    }));
    expect(builders.member_payments.insert).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith("record_member_membership_payment", expect.objectContaining({ p_membership_id: membershipId, p_amount: 100 }));
  });

  it("rejects overpayment and accepts exactly the remaining balance", async () => {
    const today = dateInTimeZone(new Date(), "Asia/Kolkata");
    const over = configureSupabase({
      membershipResult: { data: { id: membershipId, price_snapshot: 3500, status: "active" }, error: null },
      paymentRowsResult: { data: [{ amount: 3000, status: "completed" }], error: null },
    });
    const rejected = await recordMemberPaymentAction(memberId, membershipId, initialFormActionState, form({ amount: "600", payment_date: today, payment_method: "cash", reference: "", notes: "" }));
    expect(rejected.status).toBe("error");
    expect(rejected.message).toContain("outstanding balance of ₹500.00");
    expect(over.supabase.rpc).not.toHaveBeenCalled();

    const exact = configureSupabase({
      membershipResult: { data: { id: membershipId, price_snapshot: 3500, status: "active" }, error: null },
      paymentRowsResult: { data: [{ amount: 3000, status: "completed" }], error: null },
      rpcResult: { data: paymentId, error: null },
    });
    const accepted = await recordMemberPaymentAction(memberId, membershipId, initialFormActionState, form({ amount: "500", payment_date: today, payment_method: "cash", reference: "", notes: "" }));
    expect(accepted.status).toBe("success");
    expect(exact.supabase.rpc).toHaveBeenCalledWith("record_member_membership_payment", expect.objectContaining({ p_amount: 500, p_membership_id: membershipId }));
  });

  it("rejects future dates and cross-tenant members without inserting payment data", async () => {
    const today = dateInTimeZone(new Date(), "Asia/Kolkata");
    const future = configureSupabase();
    const futureResult = await recordMemberPaymentAction(memberId, membershipId, initialFormActionState, form({
      amount: "100", payment_date: addDaysToIsoDate(today, 1), payment_method: "cash", reference: "", notes: "",
    }));
    expect(futureResult.status).toBe("error");
    expect(future.supabase.rpc).not.toHaveBeenCalled();

    const crossTenant = configureSupabase({ memberResult: { data: null, error: null } });
    const denied = await recordMemberPaymentAction(memberId, membershipId, initialFormActionState, form({
      amount: "100", payment_date: today, payment_method: "cash", reference: "", notes: "",
    }));
    expect(denied.status).toBe("error");
    expect(crossTenant.supabase.rpc).not.toHaveBeenCalled();
  });

  it("preserves the authentication guard on direct server-side RLS inserts", async () => {
    mockRequireGymAdminContext.mockRejectedValue(new Error("NEXT_REDIRECT:/unauthorized"));
    await expect(recordMemberPaymentAction(memberId, membershipId, initialFormActionState, form({
      amount: "100", payment_date: "2026-10-08", payment_method: "cash", reference: "", notes: "",
    }))).rejects.toThrow("NEXT_REDIRECT:/unauthorized");
    expect(mockCreateServerSupabaseClient).not.toHaveBeenCalled();
  });
});
