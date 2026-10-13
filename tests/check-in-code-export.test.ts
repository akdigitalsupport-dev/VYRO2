import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/gym/check-in-codes/route";

const { requireContext, createClient, rpc } = vi.hoisted(() => ({
  requireContext: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireGymAdminContext: requireContext }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: createClient }));

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ gymId: "gym-from-session", user: { id: "admin-from-session" } });
  createClient.mockResolvedValue({ rpc });
});

describe("gym member ID export", () => {
  it("requires a complete roster and downloads a private, formula-safe CSV", async () => {
    rpc.mockResolvedValueOnce({ data: [{ active_members: 1, assigned_codes: 1 }], error: null });
    rpc.mockResolvedValueOnce({ data: [{ full_name: "=HYPERLINK(\"https://bad.example\")", check_in_code: "0042" }], error: null });
    const response = await GET();
    const csv = await response.text();
    expect(requireContext).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain('"0042"');
    expect(rpc.mock.calls[1][0]).toBe("get_gym_checkin_codes");
  });

  it("does not export a partial list when active members are missing IDs", async () => {
    rpc.mockResolvedValueOnce({ data: [{ active_members: 3, assigned_codes: 2 }], error: null });
    const response = await GET();
    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledOnce();
  });
});
