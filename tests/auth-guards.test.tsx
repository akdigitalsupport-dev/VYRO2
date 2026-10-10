import { beforeEach, describe, expect, it, vi } from "vitest";
import GymLayout from "@/app/(gym)/gym/layout";
import GymIndexPage from "@/app/(gym)/gym/page";
import PlatformLayout from "@/app/(platform)/platform/layout";
import AuthRedirectPage from "@/app/(auth)/auth/redirect/page";
import { getAuthenticatedHomePath, requirePlatformOwner } from "@/lib/auth/guards";

const { mockCreateServerSupabaseClient } = vi.hoisted(() => ({
  mockCreateServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
  createSupabaseServerClient: mockCreateServerSupabaseClient,
  hasSupabaseConfig: vi.fn(() => true),
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string): never => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  },
}));

type MockAccess = {
  userId?: string | null;
  role?: string | null;
  gymAdminMemberships?: Array<{ gym_id: string }>;
};

function configureAccess({
  userId = "user-1",
  role = "gym_admin",
  gymAdminMemberships = [{ gym_id: "gym-1" }],
}: MockAccess = {}) {
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);
  profileQuery.maybeSingle.mockResolvedValue({ data: role ? { role } : null, error: null });

  const membershipQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
  };
  membershipQuery.select.mockReturnValue(membershipQuery);
  membershipQuery.eq.mockReturnValue(membershipQuery);
  membershipQuery.limit.mockResolvedValue({ data: gymAdminMemberships, error: null });
  const notificationQuery = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), limit: vi.fn() };
  notificationQuery.select.mockReturnValue(notificationQuery); notificationQuery.eq.mockReturnValue(notificationQuery); notificationQuery.is.mockReturnValue(notificationQuery); notificationQuery.order.mockReturnValue(notificationQuery); notificationQuery.limit.mockResolvedValue({ data: [], error: null });

  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
    from: vi.fn((table: string) => table === "user_profiles" ? profileQuery : table === "gym_user_memberships" ? membershipQuery : notificationQuery),
  };

  mockCreateServerSupabaseClient.mockResolvedValue(supabase);
  return { supabase, profileQuery, membershipQuery };
}

async function expectRedirect(result: Promise<unknown>, destination: string) {
  await expect(result).rejects.toThrow(`NEXT_REDIRECT:${destination}`);
}

describe("server-side workspace access guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("A. redirects unauthenticated users away from /gym", async () => {
    configureAccess({ userId: null });
    await expectRedirect(GymLayout({ children: "protected" }), "/login");
  });

  it("B. redirects unauthenticated users away from /platform", async () => {
    configureAccess({ userId: null });
    await expectRedirect(PlatformLayout({ children: "protected" }), "/login");
  });

  it("C. denies a gym admin access to /platform", async () => {
    configureAccess({ role: "gym_admin" });
    await expectRedirect(PlatformLayout({ children: "protected" }), "/gym/command-center");
  });

  it("D. denies /gym when an authenticated user has no gym-admin membership", async () => {
    configureAccess({ role: "gym_admin", gymAdminMemberships: [] });
    await expectRedirect(GymLayout({ children: "protected" }), "/unauthorized");
  });

  it("denies a gym admin with two memberships while multi-gym administration is intentionally unsupported", async () => {
    configureAccess({
      role: "gym_admin",
      gymAdminMemberships: [{ gym_id: "gym-1" }, { gym_id: "gym-2" }],
    });

    await expectRedirect(GymLayout({ children: "protected" }), "/unauthorized");
  });

  it("E. allows a gym admin with one valid gym-admin membership into /gym", async () => {
    configureAccess({ role: "gym_admin", gymAdminMemberships: [{ gym_id: "gym-1" }] });
    await expect(GymLayout({ children: "protected" })).resolves.toBeTruthy();
    expect(() => GymIndexPage()).toThrow("NEXT_REDIRECT:/gym/command-center");
  });

  it("F. allows a platform owner into /platform", async () => {
    configureAccess({ role: "platform_owner", gymAdminMemberships: [] });
    await expect(PlatformLayout({ children: "protected" })).resolves.toBeTruthy();
  });

  it("G. ignores browser-provided role values when authorizing", async () => {
    configureAccess({ role: "gym_admin" });
    window.localStorage.setItem("role", "platform_owner");
    window.history.replaceState({}, "", "/platform?role=platform_owner");

    await expectRedirect(requirePlatformOwner(), "/gym/command-center");
  });

  it("uses the authenticated server user id for profile and membership lookups", async () => {
    const { profileQuery, membershipQuery } = configureAccess({
      userId: "authenticated-user",
      role: "gym_admin",
      gymAdminMemberships: [{ gym_id: "gym-1" }],
    });

    await GymLayout({ children: "protected" });

    expect(profileQuery.eq).toHaveBeenCalledWith("user_id", "authenticated-user");
    expect(membershipQuery.eq).toHaveBeenCalledWith("user_id", "authenticated-user");
    expect(membershipQuery.eq).toHaveBeenCalledWith("role", "gym_admin");
  });
});

describe("mocked application post-login redirect behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("redirects a platform_owner to the fixed internal platform destination", async () => {
    configureAccess({ role: "platform_owner", gymAdminMemberships: [] });

    await expect(AuthRedirectPage()).rejects.toThrow("NEXT_REDIRECT:/platform");
    await expect(getAuthenticatedHomePath()).resolves.toBe("/platform");
  });

  it("redirects a valid gym_admin to the fixed internal gym destination", async () => {
    configureAccess({ role: "gym_admin", gymAdminMemberships: [{ gym_id: "gym-1" }] });

    await expect(AuthRedirectPage()).rejects.toThrow("NEXT_REDIRECT:/gym/command-center");
    await expect(getAuthenticatedHomePath()).resolves.toBe("/gym/command-center");
  });

  it("sends an authenticated unauthorized profile to the safe unauthorized page", async () => {
    configureAccess({ role: "member", gymAdminMemberships: [] });

    await expectRedirect(getAuthenticatedHomePath(), "/unauthorized");
    await expectRedirect(AuthRedirectPage(), "/unauthorized");
  });

  it("ignores redirect, next, callback, role, and external URL query values", async () => {
    configureAccess({ role: "platform_owner", gymAdminMemberships: [] });
    window.history.replaceState(
      {},
      "",
      "/auth/redirect?redirect=https%3A%2F%2Fevil.example&next=%2Fgym&callback=https%3A%2F%2Fevil.example&role=gym_admin",
    );

    await expect(AuthRedirectPage()).rejects.toThrow("NEXT_REDIRECT:/platform");
    await expect(getAuthenticatedHomePath()).resolves.toBe("/platform");
  });

  it("uses the server profile when localStorage claims a different role", async () => {
    configureAccess({ role: "gym_admin", gymAdminMemberships: [{ gym_id: "gym-1" }] });
    window.localStorage.setItem("role", "platform_owner");

    await expectRedirect(AuthRedirectPage(), "/gym/command-center");
  });
});
