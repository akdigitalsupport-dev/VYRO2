import { beforeEach, describe, expect, it, vi } from "vitest";
import { archiveExpenseAction, saveExpenseAction } from "@/app/(gym)/gym/expenses/actions";
import type { FormActionState } from "@/lib/forms";

const { requireContext, createClient, revalidate } = vi.hoisted(() => ({ requireContext: vi.fn(), createClient: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireGymAdminContext: requireContext }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: createClient }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
const gymId = "e4d63723-afce-4ec0-bac0-bc98f07555d5";
const initial: FormActionState = { status: "idle", message: "" };
function form(overrides: Record<string, string> = {}) { const f = new FormData(); for (const [k, v] of Object.entries({ expense_date: "2026-10-08", category: "rent", amount: "1200.50", description: "October rent", reference: "R-12", notes: "paid by transfer", ...overrides })) f.set(k, v); return f; }
function configure(result: { data: unknown; error: { code?: string } | null } = { data: { id: "expense-1" }, error: null }) {
 const builder: Record<string, ReturnType<typeof vi.fn>> = {};
 for (const name of ["insert", "update", "select", "eq", "is"]) builder[name] = vi.fn(() => builder);
 builder.single = vi.fn().mockResolvedValue(result); builder.maybeSingle = vi.fn().mockResolvedValue(result);
 const supabase = { from: vi.fn(() => builder) }; createClient.mockResolvedValue(supabase); return { supabase, builder };
}
beforeEach(() => { vi.clearAllMocks(); requireContext.mockResolvedValue({ gymId, user: { id: "auth-user" } }); });
describe("tenant-scoped expense actions", () => {
 it("derives gym and recorder from the authenticated server context", async () => {
  const { builder } = configure(); const result = await saveExpenseAction(initial, form());
  expect(result.status).toBe("success"); expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ gym_id: gymId, recorded_by: "auth-user", amount: 1200.5, category: "rent" }));
  expect(builder.insert.mock.calls[0][0]).not.toHaveProperty("gym_id", "browser-gym-id");
 });
 it("rejects nonpositive amounts before opening the database client", async () => {
  const result = await saveExpenseAction(initial, form({ amount: "0" }));
  expect(result.status).toBe("error"); expect(createClient).not.toHaveBeenCalled();
 });
 it("scopes archive mutations to the authorized gym and active expense", async () => {
  const { builder } = configure(); const result = await archiveExpenseAction("a1234567-b123-4123-8123-123456789abc");
  expect(result.status).toBe("success"); expect(builder.eq).toHaveBeenCalledWith("gym_id", gymId); expect(builder.is).toHaveBeenCalledWith("archived_at", null);
 });
});
