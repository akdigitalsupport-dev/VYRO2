import { describe, expect, it, vi } from "vitest";
import MembershipsRedirect from "@/app/(gym)/gym/memberships/page";
import PaymentsRedirect from "@/app/(gym)/gym/payments/page";

vi.mock("next/navigation", () => ({ redirect: (path: string): never => { throw new Error(`NEXT_REDIRECT:${path}`); } }));

describe("legacy membership and payment routes", () => {
  it("keeps membership history inside member profiles", () => {
    expect(() => MembershipsRedirect()).toThrow("NEXT_REDIRECT:/gym/members");
  });
  it("keeps payments inside member profiles", () => {
    expect(() => PaymentsRedirect()).toThrow("NEXT_REDIRECT:/gym/members");
  });
});
