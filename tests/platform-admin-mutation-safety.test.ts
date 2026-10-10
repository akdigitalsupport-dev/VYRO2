import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormActionState } from "@/lib/forms";
import { createGymTrialAction, updateGymWorkspaceStatusAction } from "@/app/(platform)/platform/gyms/actions";
import { savePlatformPlanAction } from "@/app/(platform)/platform/plans/actions";
import { createPendingPlatformPaymentAction, markPlatformPaymentReceivedAction } from "@/app/(platform)/platform/revenue/actions";
import { renewPlatformSubscriptionAction, updateSubscriptionPricingAction, updateSubscriptionStatusAction } from "@/app/(platform)/platform/revenue/subscriptions-actions";
import { createSupportTicketAction, updateSupportTicketAction } from "@/app/(platform)/platform/support/actions";
import { updatePlatformSettingsAction } from "@/app/(platform)/platform/settings/actions";

const { requirePlatformOwner, createAdminClient, createServerClient, revalidatePath } = vi.hoisted(() => ({
  requirePlatformOwner: vi.fn(),
  createAdminClient: vi.fn(),
  createServerClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requirePlatformOwner }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: createAdminClient }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: createServerClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

const initial: FormActionState = { status: "idle", message: "" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  requirePlatformOwner.mockResolvedValue({ id: "platform-owner-id", email: "owner@example.com" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Platform Admin preview mutation safety", () => {
  const protectedActions = [
    ["create gym / free trial", createGymTrialAction],
    ["change gym access", updateGymWorkspaceStatusAction],
    ["save SaaS plan", savePlatformPlanAction],
    ["create pending SaaS payment", createPendingPlatformPaymentAction],
    ["mark a SaaS payment received", markPlatformPaymentReceivedAction],
    ["change subscription pricing", updateSubscriptionPricingAction],
    ["change subscription status", updateSubscriptionStatusAction],
    ["renew subscription", renewPlatformSubscriptionAction],
    ["create support ticket", createSupportTicketAction],
    ["update support ticket", updateSupportTicketAction],
    ["update platform settings", updatePlatformSettingsAction],
  ] as const;

  it.each(protectedActions)("%s cannot write to production-backed data in a preview deployment", async (_label, action) => {
    const result = await action(initial, new FormData());
    expect(result.status).toBe("error");
    expect(result.message).toContain("preview");
    expect(requirePlatformOwner).toHaveBeenCalledOnce();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
