import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeAccountPasswordAction, requestAccountEmailChangeAction } from "@/lib/account-security/actions";

const { createServerClient, requireGymAdminContext, revalidatePath } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  requireGymAdminContext: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: createServerClient }));
vi.mock("@/lib/auth/guards", () => ({ requireGymAdminContext }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (path: string): never => { throw new Error(`NEXT_REDIRECT:${path}`); } }));

const initial = { status: "idle" as const, message: "" };

function setup({ userId = "server-user", email = "owner@example.com", role = "platform_owner", updateError = null }: { userId?: string; email?: string; role?: string | null; updateError?: { message: string } | null } = {}) {
  const profileQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);
  profileQuery.maybeSingle.mockResolvedValue({ data: role ? { role } : null, error: null });
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId, email } }, error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: updateError }),
    signOut: vi.fn(),
  };
  createServerClient.mockResolvedValue({ auth, from: vi.fn(() => profileQuery) });
  requireGymAdminContext.mockResolvedValue({ user: { id: userId, email }, gymId: "gym-1" });
  return { auth, profileQuery };
}

beforeEach(() => vi.clearAllMocks());

describe("account security actions", () => {
  it("uses the authenticated platform owner's identity to request email change", async () => {
    const { auth, profileQuery } = setup();
    const form = new FormData(); form.set("email", "owner+new@example.com");

    const result = await requestAccountEmailChangeAction(initial, form);

    expect(result).toMatchObject({ status: "success" });
    expect(profileQuery.eq).toHaveBeenCalledWith("user_id", "server-user");
    expect(auth.updateUser).toHaveBeenCalledWith({ email: "owner+new@example.com" });
    expect(revalidatePath).toHaveBeenCalledWith("/platform/settings");
  });

  it("keeps password change available when email change configuration rejects the request", async () => {
    const { auth } = setup({ updateError: { message: "private provider detail" } });
    const emailForm = new FormData(); emailForm.set("email", "new@example.com");
    const passwordForm = new FormData(); passwordForm.set("password", "a very strong password"); passwordForm.set("confirm", "a very strong password");

    const emailResult = await requestAccountEmailChangeAction(initial, emailForm);
    const passwordResult = await changeAccountPasswordAction(initial, passwordForm);

    expect(emailResult.message).toContain("confirmation email delivery");
    expect(emailResult.message).not.toContain("private provider detail");
    expect(passwordResult.message).toContain("session remains active");
    expect(auth.updateUser).toHaveBeenNthCalledWith(1, { email: "new@example.com" });
    expect(auth.updateUser).toHaveBeenNthCalledWith(2, { password: "a very strong password" });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("rejects short and mismatched passwords before calling Supabase Auth", async () => {
    const { auth } = setup();
    const short = new FormData(); short.set("password", "short"); short.set("confirm", "short");
    const mismatch = new FormData(); mismatch.set("password", "a very strong password"); mismatch.set("confirm", "a different strong password");

    expect((await changeAccountPasswordAction(initial, short)).status).toBe("error");
    expect((await changeAccountPasswordAction(initial, mismatch)).message).toContain("do not match");
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects non-admin roles and does not mutate the account", async () => {
    const { auth } = setup({ role: "member" });
    const form = new FormData(); form.set("password", "a very strong password"); form.set("confirm", "a very strong password");

    await expect(changeAccountPasswordAction(initial, form)).rejects.toThrow("NEXT_REDIRECT:/unauthorized");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("keeps a gym admin's authenticated session and revalidates gym settings", async () => {
    const { auth } = setup({ userId: "gym-admin", email: "gym@example.com", role: "gym_admin" });
    const form = new FormData(); form.set("password", "another strong password"); form.set("confirm", "another strong password");

    const result = await changeAccountPasswordAction(initial, form);

    expect(result.status).toBe("success");
    expect(requireGymAdminContext).toHaveBeenCalledOnce();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "another strong password" });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/gym/settings");
  });
});
