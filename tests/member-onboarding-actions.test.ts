import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemberAction } from "@/app/(gym)/gym/members/actions";
import { dateInTimeZone } from "@/lib/validation/member-finance";
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

function mockBuilder(result: { data: unknown; error: { code?: string } | null }) {
  const state = {
    inserted: undefined as unknown,
    select: vi.fn(() => state),
    eq: vi.fn(() => state),
    insert: vi.fn((row: unknown) => {
      state.inserted = row;
      return state;
    }),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return state;
}

function configure({
  planResult = { data: { id: planId, price: "1499.00" }, error: null },
  settingsResult = { data: { timezone: "Asia/Kolkata", currency: "INR" }, error: null },
  membershipResult = { data: { id: membershipId, price_snapshot: "1499.00" }, error: null },
  paymentResult = { data: { id: paymentId }, error: null },
  createResult,
}: {
  planResult?: { data: unknown; error: { code?: string } | null };
  settingsResult?: { data: unknown; error: { code?: string } | null };
  membershipResult?: { data: unknown; error: { code?: string } | null };
  paymentResult?: { data: unknown; error: { code?: string } | null };
  createResult?: { data: unknown; error: { code?: string } | null };
} = {}) {
  const builders = {
    membership_plans: mockBuilder(planResult),
    gym_settings: mockBuilder(settingsResult),
    member_memberships: mockBuilder(membershipResult),
    member_payments: mockBuilder(paymentResult),
  };
  const rpcDefault = { data: [{ member_id: memberId, membership_id: membershipId, payment_id: (planResult.data as { price?: string } | null)?.price === "0.00" ? null : paymentId, registration_payment_id: "registration-payment-id" }], error: null };
  const supabase = {
    from: vi.fn((table: keyof typeof builders) => builders[table]),
    rpc: vi.fn().mockResolvedValue(createResult ?? rpcDefault),
  };
  mockCreateServerSupabaseClient.mockResolvedValue(supabase);
  return { supabase, builders };
}

function form(values: Record<string, FormDataEntryValue>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function onboardingForm(paymentDate = dateInTimeZone(new Date(), "Asia/Kolkata")) {
  return form({
    full_name: "Taylor Member",
    phone: "9876543210",
    email: "taylor@example.com",
    gender: "not_specified",
    date_of_birth: "",
    address: "",
    joining_date: "2026-10-08",
    notes: "",
    membership_plan_id: planId,
    membership_start_date: "2026-10-08",
    initial_payment_amount: "1499",
    payment_date: paymentDate,
    payment_method: "upi",
    reference: "UPI-104",
    payment_notes: "First membership",
    registration_payment_date: paymentDate,
    registration_payment_method: "cash",
    registration_reference: "REG-104",
    registration_notes: "First-time registration",
    charge_registration: "on",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireGymAdminContext.mockResolvedValue({ gymId, user: { id: "authenticated-user" } });
});

describe("new member onboarding action", () => {
  it("creates a paid member, initial membership, and payment through one atomic RPC", async () => {
    const { supabase, builders } = configure();
    const result = await createMemberAction(initialFormActionState, onboardingForm());

    expect(result.status).toBe("success");
    expect(result.recordId).toBe(memberId);
    expect(supabase.rpc).toHaveBeenCalledWith("create_gym_member_with_registration", expect.objectContaining({
      p_full_name: "Taylor Member",
      p_membership_plan_id: planId,
      p_membership_start_date: "2026-10-08",
      p_initial_payment_amount: 1499,
    }));
    const rpcArgs = supabase.rpc.mock.calls[0][1];
    expect(rpcArgs).not.toHaveProperty("gym_id");
    expect(rpcArgs).not.toHaveProperty("p_registration_amount");
    expect(rpcArgs.p_charge_registration).toBe(true);
    expect(rpcArgs).toMatchObject({ p_payment_method: "upi", p_payment_date: expect.any(String), p_reference: "UPI-104" });
    expect(rpcArgs).toMatchObject({ p_registration_payment_method: "cash", p_registration_payment_date: expect.any(String), p_registration_reference: "REG-104" });
    expect(builders.member_payments.insert).not.toHaveBeenCalled();
  });

  it("rejects an unavailable or cross-gym plan before creating a member", async () => {
    const { supabase, builders } = configure({ planResult: { data: null, error: null } });
    const result = await createMemberAction(initialFormActionState, onboardingForm());
    expect(result.status).toBe("error");
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(builders.membership_plans.eq).toHaveBeenCalledWith("gym_id", gymId);
  });

  it("creates a server-verified free membership without creating a zero-value payment", async () => {
    const { supabase, builders } = configure({
      planResult: { data: { id: planId, price: "0.00" }, error: null },
      membershipResult: { data: { id: membershipId, price_snapshot: "0.00" }, error: null },
    });
    const result = await createMemberAction(initialFormActionState, form({ ...Object.fromEntries(onboardingForm().entries()), initial_payment_amount: "0" }));

    expect(result.status).toBe("success");
    expect(result.message).toContain("separate registration payment saved together");
    expect(supabase.rpc).toHaveBeenCalledWith("create_gym_member_with_registration", expect.objectContaining({ p_membership_plan_id: planId, p_initial_payment_amount: 0 }));
    expect(builders.member_payments.insert).not.toHaveBeenCalled();
  });

  it("creates a partial initial payment from the membership snapshot and leaves the balance due", async () => {
    const { supabase } = configure();
    const result = await createMemberAction(initialFormActionState, form({ ...Object.fromEntries(onboardingForm().entries()), initial_payment_amount: "500.00" }));
    expect(result.status).toBe("success");
    expect(supabase.rpc).toHaveBeenCalledWith("create_gym_member_with_registration", expect.objectContaining({ p_initial_payment_amount: 500, p_charge_registration: true }));
    expect(supabase.rpc.mock.calls[0][1]).not.toHaveProperty("gym_id");
    expect(supabase.rpc.mock.calls[0][1]).not.toHaveProperty("price");
  });

  it("allows pay-later without creating a zero-value payment and rejects overpayment", async () => {
    const payLater = configure({ createResult: { data: [{ member_id: memberId, membership_id: membershipId, payment_id: null, registration_payment_id: "registration-payment-id" }], error: null } });
    const laterResult = await createMemberAction(initialFormActionState, form({ ...Object.fromEntries(onboardingForm().entries()), initial_payment_amount: "0" }));
    expect(laterResult.status).toBe("success");
    expect(payLater.supabase.rpc).toHaveBeenCalledWith("create_gym_member_with_registration", expect.objectContaining({ p_initial_payment_amount: 0, p_payment_method: null, p_payment_date: null }));

    const over = configure();
    const rejected = await createMemberAction(initialFormActionState, form({ ...Object.fromEntries(onboardingForm().entries()), initial_payment_amount: "1500" }));
    expect(rejected.status).toBe("error");
    expect(rejected.message).toContain("₹1,499.00");
    expect(over.supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects a future payment date before creating a member", async () => {
    const futureDate = `${dateInTimeZone(new Date(), "Asia/Kolkata").slice(0, 4)}-12-31`;
    const { supabase } = configure();
    const result = await createMemberAction(initialFormActionState, onboardingForm(futureDate));
    expect(result.status).toBe("error");
    expect(result.message).toContain("future");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("passes the future start date through the atomic RPC so payment is linked to that exact membership", async () => {
    const futureStart = "2026-12-01";
    const { supabase, builders } = configure();
    const result = await createMemberAction(initialFormActionState, form({
      ...Object.fromEntries(onboardingForm().entries()),
      membership_start_date: futureStart,
    }));
    expect(result.status).toBe("success");
    expect(supabase.rpc).toHaveBeenCalledWith("create_gym_member_with_registration", expect.objectContaining({ p_membership_start_date: futureStart, p_initial_payment_amount: 1499 }));
    expect(builders.member_payments.insert).not.toHaveBeenCalled();
  });

  it("reports a failed atomic RPC without claiming partial completion", async () => {
    const { supabase } = configure({ createResult: { data: null, error: { code: "42501" } } });
    const result = await createMemberAction(initialFormActionState, onboardingForm());
    expect(result.status).toBe("error");
    expect(result.recordId).toBeUndefined();
    expect(result.message).toContain("selected plan is no longer available");
    expect(supabase.rpc).toHaveBeenCalledWith("create_gym_member_with_registration", expect.any(Object));
  });

  it("does not create a registration transaction when the fee is disabled", async () => {
    const { supabase } = configure({ settingsResult: { data: { timezone: "Asia/Kolkata", currency: "INR", registration_fee_enabled: false, registration_fee_amount: "199.00" }, error: null }, createResult: { data: [{ member_id: memberId, membership_id: membershipId, payment_id: paymentId, registration_payment_id: null }], error: null } });
    const result = await createMemberAction(initialFormActionState, onboardingForm());
    expect(result.status).toBe("success");
    expect(supabase.rpc).toHaveBeenCalledWith("create_gym_member_with_registration", expect.objectContaining({ p_registration_payment_date: null, p_registration_payment_method: null }));
  });

  it("supports opting out of registration while atomically creating membership and partial payment", async () => {
    const { supabase } = configure({ createResult: { data: [{ member_id: memberId, membership_id: membershipId, payment_id: paymentId, registration_payment_id: null }], error: null } });
    const fields = Object.fromEntries(onboardingForm().entries());
    fields.initial_payment_amount = "500.00";
    fields.charge_registration = "";
    const result = await createMemberAction(initialFormActionState, form(fields));
    expect(result.status).toBe("success");
    expect(supabase.rpc).toHaveBeenCalledWith("create_gym_member_with_registration", expect.objectContaining({ p_initial_payment_amount: 500, p_charge_registration: false }));
    expect(supabase.rpc.mock.calls[0][1]).not.toHaveProperty("p_registration_amount");
  });

  it("forces registration off server-side when gym settings globally disable the fee", async () => {
    const { supabase } = configure({ settingsResult: { data: { timezone: "Asia/Kolkata", currency: "INR", registration_fee_enabled: false, registration_fee_amount: "199.00" }, error: null }, createResult: { data: [{ member_id: memberId, membership_id: membershipId, payment_id: paymentId, registration_payment_id: null }], error: null } });
    const result = await createMemberAction(initialFormActionState, onboardingForm());
    expect(result.status).toBe("success");
    expect(supabase.rpc).toHaveBeenCalledWith("create_gym_member_with_registration", expect.objectContaining({ p_charge_registration: false, p_registration_payment_date: null }));
  });

  it("rejects a future registration payment date before creating any records", async () => {
    const { supabase } = configure();
    const nextYear = `${Number(dateInTimeZone(new Date(), "Asia/Kolkata").slice(0, 4)) + 1}-01-01`;
    const result = await createMemberAction(initialFormActionState, form({ ...Object.fromEntries(onboardingForm().entries()), registration_payment_date: nextYear }));
    expect(result.status).toBe("error");
    expect(result.message).toContain("Registration payment date");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
