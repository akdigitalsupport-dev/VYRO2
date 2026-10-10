import { beforeEach, describe, expect, it, vi } from "vitest";
import { archiveMemberAction } from "@/app/(gym)/gym/members/actions";
import { setPlanActiveAction } from "@/app/(gym)/gym/plans/actions";

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

function setup({ data = { id: memberId }, error = null }: { data?: unknown; error?: { code?: string } | null } = {}) {
  const builders: Array<{ table: string; filters: Array<[string, unknown]>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }> = [];
  const supabase = {
    from: vi.fn((table: string) => {
      const builder = {
        table,
        filters: [] as Array<[string, unknown]>,
        update: vi.fn(() => builder),
        delete: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => { builder.filters.push([column, value]); return builder; }),
        neq: vi.fn((column: string, value: unknown) => { builder.filters.push([column, value]); return builder; }),
        select: vi.fn(() => builder),
        maybeSingle: vi.fn().mockResolvedValue({ data, error }),
      };
      builders.push(builder);
      return builder;
    }),
  };
  mockCreateServerSupabaseClient.mockResolvedValue(supabase);
  return { supabase, builders };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireGymAdminContext.mockResolvedValue({ gymId, user: { id: "authenticated-user" } });
});

describe("safe member archive", () => {
  it("archives only the authenticated gym member and preserves history tables", async () => {
    const { supabase, builders } = setup();
    const result = await archiveMemberAction(memberId);

    expect(result.status).toBe("success");
    expect(builders[0].update).toHaveBeenCalledWith(expect.objectContaining({ status: "archived", archived_at: expect.any(String) }));
    expect(builders[0].filters).toContainEqual(["id", memberId]);
    expect(builders[0].filters).toContainEqual(["gym_id", gymId]);
    expect(builders[0].filters).toContainEqual(["status", "archived"]);
    expect(supabase.from.mock.calls.map(([table]) => table)).toEqual(["members"]);
  });

  it("does not archive a member outside the authorized gym", async () => {
    setup({ data: null });
    const result = await archiveMemberAction(memberId);
    expect(result.status).toBe("error");
  });
});

describe("safe plan deactivation", () => {
  it("deactivates the authorized gym plan without deleting membership history", async () => {
    const { supabase, builders } = setup();
    const result = await setPlanActiveAction(planId, false);

    expect(result.status).toBe("success");
    expect(builders[0].table).toBe("membership_plans");
    expect(builders[0].update).toHaveBeenCalledWith({ is_active: false });
    expect(builders[0].filters).toContainEqual(["id", planId]);
    expect(builders[0].filters).toContainEqual(["gym_id", gymId]);
    expect(builders[0].delete).not.toHaveBeenCalled();
    expect(supabase.from.mock.calls.map(([table]) => table)).toEqual(["membership_plans"]);
  });

  it("does not change a plan that is outside the authorized gym", async () => {
    const { builders } = setup({ data: null });
    const result = await setPlanActiveAction(planId, false);
    expect(result.status).toBe("error");
    expect(builders[0].filters).toContainEqual(["gym_id", gymId]);
  });
});
