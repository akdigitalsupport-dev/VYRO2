import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MembershipActions, type MembershipPlanOption } from "@/components/members/member-finance-controls";

afterEach(cleanup);

const memberId = "540e2568-cf64-45f7-9476-667bbd8241e2";
const plan: MembershipPlanOption = {
  id: "d3f1baba-c047-49c3-8712-f818dad639f6",
  name: "Starter",
  duration_days: 30,
  price: 599,
};

describe("member profile membership actions", () => {
  it("offers assignment when the member has no membership history", () => {
    render(
      <MembershipActions
        memberId={memberId}
        joiningDate="2026-10-01"
        today="2026-10-08"
        latestMembership={null}
        hasMembershipHistory={false}
        hasCurrentOrUpcomingMembership={false}
        plans={[plan]}
      />,
    );

    expect(screen.getByRole("button", { name: "Assign membership" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Renew" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change plan" })).not.toBeInTheDocument();
  });

  it("offers Renew and Change plan for a member with a current membership", () => {
    render(
      <MembershipActions
        memberId={memberId}
        joiningDate="2026-10-01"
        today="2026-10-08"
        latestMembership={{
          id: "efae10cb-ed56-4421-b9c3-9dbe961d9c57",
          membership_plan_id: plan.id,
          plan_name_snapshot: plan.name,
          duration_days_snapshot: 30,
          price_snapshot: 599,
          start_date: "2026-10-01",
          end_date: "2026-10-31",
          status: "active",
        }}
        hasMembershipHistory
        hasCurrentOrUpcomingMembership
        plans={[plan]}
      />,
    );

    expect(screen.getByRole("button", { name: "Renew" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change plan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign membership" })).not.toBeInTheDocument();
  });
});
