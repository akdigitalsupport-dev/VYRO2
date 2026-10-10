import type { Metadata } from "next";
import { CircleCheck, CirclePause, Layers3 } from "lucide-react";
import { PlanFormDialog, type EditablePlan } from "@/components/plans/plan-form-dialog";
import { PlanActiveToggle } from "@/components/plans/plan-active-toggle";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { formatInr } from "@/lib/money";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Membership plans" };

function PlanCard({ plan }: { plan: EditablePlan }) {
  return (
    <article className="rounded-lg border border-border/80 bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-base font-semibold">{plan.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{plan.duration_days.toLocaleString("en-IN")} days</p>
        </div>
        <Badge variant={plan.is_active ? "positive" : "default"}>{plan.is_active ? "Active" : "Inactive"}</Badge>
      </div>
      <p className="mt-5 font-display text-2xl font-semibold tracking-[-0.04em]">{formatInr(Number(plan.price), { fractionDigits: 2 })}</p>
      {plan.description ? <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{plan.description}</p> : null}
      <div className="mt-4 border-t border-border/70 pt-3">
        <div className="flex flex-wrap gap-2">
          <PlanFormDialog plan={plan} />
          <PlanActiveToggle planId={plan.id} isActive={plan.is_active} />
        </div>
      </div>
    </article>
  );
}

export default async function PlansPage() {
  const { gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("membership_plans")
    .select("id, name, duration_days, price, description, is_active")
    .eq("gym_id", gymId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  const plans = (data ?? []) as EditablePlan[];
  const activePlans = plans.filter((plan) => plan.is_active).length;
  const inactivePlans = plans.length - activePlans;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <PageHeader
        eyebrow="Gym workspace · catalog"
        title="Membership plans"
        description="Set the plans your members can join. Each plan belongs to your gym and keeps a snapshot when assigned to a member."
      >
        <PlanFormDialog />
      </PageHeader>

      {error ? (
        <ErrorState title="Plans could not be loaded" description="Your plan catalog is temporarily unavailable. Refresh the page and try again." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard icon={Layers3} label="Total plans" value={String(plans.length)} />
            <StatCard icon={CircleCheck} label="Active" value={String(activePlans)} hint="Available for new members" />
            <StatCard icon={CirclePause} label="Inactive" value={String(inactivePlans)} hint="Kept for existing records" />
          </div>

          {plans.length === 0 ? (
            <EmptyState
              icon={Layers3}
              title="No membership plans yet"
              description="Create your first plan to define its duration and price. You can then select it when adding a member."
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
                {plans.map((plan) => <PlanCard key={plan.id} plan={plan} />)}
              </div>
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell>
                          <p className="font-medium">{plan.name}</p>
                          {plan.description ? <p className="mt-1 max-w-lg truncate text-xs text-muted-foreground">{plan.description}</p> : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{plan.duration_days.toLocaleString("en-IN")} days</TableCell>
                        <TableCell className="whitespace-nowrap font-medium tabular-nums">{formatInr(Number(plan.price), { fractionDigits: 2 })}</TableCell>
                        <TableCell><Badge variant={plan.is_active ? "positive" : "default"}>{plan.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <PlanFormDialog plan={plan} />
                            <PlanActiveToggle planId={plan.id} isActive={plan.is_active} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
