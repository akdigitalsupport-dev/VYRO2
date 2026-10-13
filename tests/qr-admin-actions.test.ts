import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateGymCheckinCodesAction } from "@/app/(gym)/gym/attendance/qr-actions";

const { requireContext, createClient, revalidate, rpc } = vi.hoisted(() => ({
  requireContext: vi.fn(),
  createClient: vi.fn(),
  revalidate: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireGymAdminContext: requireContext }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: createClient }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ gymId: "gym-from-session", user: { id: "admin-from-session" } });
  createClient.mockResolvedValue({ rpc });
  rpc.mockResolvedValue({ data: [{ assigned_count: 14, assigned_total: 14 }], error: null });
});

describe("gym QR code admin action", () => {
  it("requires a gym admin and never accepts a browser-supplied gym", async () => {
    const result = await generateGymCheckinCodesAction();
    expect(result).toMatchObject({ status: "success", message: "Four-digit IDs generated for 14 active members." });
    expect(requireContext).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("generate_gym_checkin_codes");
    expect(rpc.mock.calls[0]).toHaveLength(1);
    expect(revalidate).toHaveBeenCalledWith("/gym/attendance");
  });

  it("reports capacity overflow without exposing member records", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "Four-digit member ID capacity reached" } });
    const result = await generateGymCheckinCodesAction();
    expect(result).toEqual({ status: "error", message: "There are not enough four-digit IDs for all active members. No codes were changed." });
    expect(result.message).not.toContain("member name");
  });
});
