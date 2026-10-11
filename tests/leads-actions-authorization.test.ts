import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormActionState } from "@/lib/forms";
import { createLeadAction, updateLeadStatusAction } from "@/app/(gym)/gym/leads/actions";

const { requireGymAdminContext, createServerSupabaseClient, revalidatePath } = vi.hoisted(() => ({
  requireGymAdminContext: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireGymAdminContext }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

const GYM_A = "bbbbbbbb-0000-4000-8000-000000000101";
const GYM_B = "bbbbbbbb-0000-4000-8000-000000000102";
const USER_A = "aaaaaaaa-0000-4000-8000-000000000101";
const LEAD_A = "cccccccc-0000-4000-8000-000000000101";
const LEAD_B = "cccccccc-0000-4000-8000-000000000102";
const initial: FormActionState = { status: "idle", message: "" };

let query: {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};
let from: ReturnType<typeof vi.fn>;

function leadForm(values: Record<string, string> = {}) {
  const form = new FormData();
  form.set("name", "Prospect One");
  form.set("phone", "+91 90000 00000");
  form.set("email", "prospect@example.test");
  form.set("source", "Referral");
  form.set("notes", "Asked about a trial");
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function statusForm(values: Record<string, string> = {}) {
  const form = new FormData();
  form.set("id", LEAD_A);
  form.set("status", "contacted");
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireGymAdminContext.mockResolvedValue({ gymId: GYM_A, user: { id: USER_A, email: "gym-a@example.test" } });

  query = {
    insert: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(),
  };
  for (const method of [query.insert, query.update, query.eq, query.select]) method.mockImplementation(() => query);
  query.single.mockResolvedValue({ data: { id: LEAD_A }, error: null });
  query.maybeSingle.mockResolvedValue({ data: { id: LEAD_A }, error: null });
  from = vi.fn(() => query);
  createServerSupabaseClient.mockResolvedValue({ from });
});

afterEach(() => vi.unstubAllEnvs());

describe("Gym Admin Leads server-action authorization", () => {
  it("creates a lead for the guard-derived gym and ignores a submitted foreign gym_id", async () => {
    const result = await createLeadAction(initial, leadForm({ gym_id: GYM_B, created_by: "aaaaaaaa-0000-4000-8000-000000000102" }));

    expect(result).toEqual({ status: "success", message: "Lead added." });
    expect(requireGymAdminContext).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("gym_leads");
    expect(query.insert).toHaveBeenCalledWith({
      gym_id: GYM_A,
      created_by: USER_A,
      name: "Prospect One",
      phone: "+91 90000 00000",
      email: "prospect@example.test",
      source: "Referral",
      notes: "Asked about a trial",
    });
    expect(query.insert.mock.calls[0][0].gym_id).not.toBe(GYM_B);
    expect(revalidatePath).toHaveBeenCalledWith("/gym/leads");
  });

  it("rejects invalid email and empty names before opening a database client", async () => {
    const badEmail = await createLeadAction(initial, leadForm({ email: "not-an-email" }));
    const badName = await createLeadAction(initial, leadForm({ name: "   " }));

    expect(badEmail.status).toBe("error");
    expect(badEmail.fieldErrors?.email).toBeTruthy();
    expect(badName.status).toBe("error");
    expect(badName.fieldErrors?.name).toBeTruthy();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it.each(["platform_owner", "trainer", "receptionist", "member"])(
    "does not create or update when the Gym Admin guard rejects a %s identity",
    async (role) => {
      const reason = `REDIRECT:/unauthorized:${role}`;
      requireGymAdminContext.mockRejectedValue(new Error(reason));

      await expect(createLeadAction(initial, leadForm())).rejects.toThrow(reason);
      await expect(updateLeadStatusAction(initial, statusForm())).rejects.toThrow(reason);

      expect(requireGymAdminContext).toHaveBeenCalledTimes(2);
      expect(createServerSupabaseClient).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("updates only the authorized gym's lead with a validated status", async () => {
    const result = await updateLeadStatusAction(initial, statusForm());

    expect(result).toEqual({ status: "success", message: "Lead status updated." });
    expect(query.update).toHaveBeenCalledWith({ status: "contacted" });
    expect(query.eq.mock.calls).toEqual([["id", LEAD_A], ["gym_id", GYM_A]]);
    expect(revalidatePath).toHaveBeenCalledWith("/gym/leads");
  });

  it("rejects invalid status before database access", async () => {
    const result = await updateLeadStatusAction(initial, statusForm({ status: "admin" }));

    expect(result).toEqual({ status: "error", message: "Lead or status is invalid." });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("returns the same safe not-found result for an inaccessible lead id", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await updateLeadStatusAction(initial, statusForm({ id: LEAD_B }));

    expect(result).toEqual({ status: "error", message: "The lead status could not be updated." });
    expect(query.eq.mock.calls).toEqual([["id", LEAD_B], ["gym_id", GYM_A]]);
  });

  it("keeps database failures in the existing safe error form state", async () => {
    query.single.mockResolvedValue({ data: null, error: { code: "42501" } });

    const result = await createLeadAction(initial, leadForm());

    expect(result).toEqual({ status: "error", message: "The lead could not be saved. Refresh and try again." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

});
