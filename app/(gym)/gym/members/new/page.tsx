import type { Metadata } from "next";
import Link from "next/link";
import { Layers3 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { CreateMemberForm, type ActivePlanOption } from "@/components/members/member-forms";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MemberWorkspaceNav } from "@/components/members/member-workspace-nav";

export const metadata: Metadata = { title: "Add member" };

function localDate(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
}

export default async function AddMemberPage() {
  const { gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const [{ data: plans, error: plansError }, { data: settings }] = await Promise.all([
    supabase
      .from("membership_plans")
      .select("id, name, duration_days, price")
      .eq("gym_id", gymId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("gym_settings").select("timezone, registration_fee_amount, registration_fee_enabled").eq("gym_id", gymId).maybeSingle(),
  ]);
  const activePlans = (plans ?? []) as ActivePlanOption[];
  const today = localDate(settings?.timezone ?? "Asia/Kolkata");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 sm:space-y-7">
      <MemberWorkspaceNav active="members" />
      <PageHeader
        eyebrow="Members"
        title="Add a member"
        description="Add a member, choose a plan, and record all or part of today’s payment in one step."
      >
        <Button asChild variant="secondary"><Link href="/gym/members">Cancel</Link></Button>
      </PageHeader>

      {plansError ? (
        <ErrorState title="Membership plans unavailable" description="Active plans could not be loaded. Try again before adding a member." />
      ) : activePlans.length === 0 ? (
        <EmptyState
          icon={Layers3}
          title="Create an active plan first"
          description="A member's first membership uses an active plan. Create a plan, then return here to add the member."
          action={{ label: "Go to plans", href: "/gym/plans" }}
        />
      ) : (
        <CommandCenterCard title="Member, plan, and payment">
          <CreateMemberForm
            plans={activePlans}
            today={today}
            registrationFee={{ enabled: settings?.registration_fee_enabled ?? false, amount: settings?.registration_fee_amount ?? 0 }}
          />
        </CommandCenterCard>
      )}
    </div>
  );
}
