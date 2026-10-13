import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/check-in/route";

const { createAdminClient, rpc } = vi.hoisted(() => ({ createAdminClient: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: createAdminClient }));

beforeEach(() => {
  vi.clearAllMocks();
  createAdminClient.mockReturnValue({ rpc });
  rpc.mockResolvedValue({ data: "checked_in", error: null });
});

const gymId = "e4d63723-afce-4ec0-bac0-bc98f07555d5";

describe("public check-in API", () => {
  it("forwards only the gym, four-digit code, and an irreversible server HMAC", async () => {
    const request = new Request("https://vyro-2-two.vercel.app/api/check-in", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "203.0.113.10" },
      body: JSON.stringify({ gymId, memberId: "0042" }),
    });
    const response = await POST(request);
    expect(await response.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("check_in_member_public", expect.objectContaining({
      p_gym_id: gymId,
      p_check_in_code: "0042",
      p_client_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("203.0.113.10");
  });

  it("uses the same response shape for a bad code and a database error", async () => {
    rpc.mockResolvedValue({ data: "unavailable", error: null });
    const bad = await POST(new Request("https://vyro-2-two.vercel.app/api/check-in", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gymId, memberId: "9999" }),
    }));
    rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    const broken = await POST(new Request("https://vyro-2-two.vercel.app/api/check-in", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gymId, memberId: "9999" }),
    }));
    expect([bad.status, await bad.json()]).toEqual([200, { ok: false }]);
    expect([broken.status, await broken.json()]).toEqual([200, { ok: false }]);
  });

  it("does not call Supabase for malformed IDs", async () => {
    const response = await POST(new Request("https://vyro-2-two.vercel.app/api/check-in", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gymId, memberId: "42" }),
    }));
    expect(await response.json()).toEqual({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the preview deployment read-only when it shares production Supabase", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const response = await POST(new Request("https://preview.example.vercel.app/api/check-in", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gymId, memberId: "0042" }),
    }));
    expect(await response.json()).toEqual({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
