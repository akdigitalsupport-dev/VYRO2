import { DashboardHeader, DataPanel, EmptyState } from "@/components/dashboard";
import { ServerTable } from "@/components/server-table";
import { createPlan, setPlanActive, updatePlan } from "@/lib/gym/actions";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PlanRow = { id: string; name: string; duration_days: number; price: number | string; description: string | null; is_active: boolean };

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [identity, params] = await Promise.all([requireRole("gym_admin"), searchParams]);
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.from("membership_plans").select("id, name, duration_days, price, description, is_active")
      .eq("gym_id", identity.gymId!).order("is_active", { ascending: false }).order("name"),
    supabase.from("gym_settings").select("currency").eq("gym_id", identity.gymId!).maybeSingle(),
  ]);
  const currency = settings?.currency || "INR";
  const plans = (data || []) as PlanRow[];
  const money = new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <>
    <DashboardHeader eyebrow="Gym workspace" title="Membership plans" description="Create flexible durations and prices for this gym." />
    {params.error && <p className="form-error" role="alert">{params.error === "validation" ? "Check the plan name, duration and price." : "The plan could not be saved. A plan with that name may already exist."}</p>}
    {params.saved && <p className="success-message" role="status">Plan saved.</p>}
    <div className="dashboard-columns">
      <DataPanel title="Your plans" description={`${plans.length} plans · inactive plans remain attached to historical memberships.`}>
        {error ? <EmptyState title="Plans could not be loaded" message="Check the database connection and retry." /> : <ServerTable rows={plans} emptyTitle="No plans created" emptyMessage="Create your first flexible membership plan." columns={[
          { label: "PLAN", className: "table-primary", render: (plan) => plan.name },
          { label: "DURATION", render: (plan) => `${plan.duration_days} days` },
          { label: "PRICE", render: (plan) => money.format(Number(plan.price)) },
          { label: "STATUS", render: (plan) => <span className={`status-badge ${plan.is_active ? "" : "expired"}`}>{plan.is_active ? "Active" : "Inactive"}</span> },
          { label: "ACTIONS", render: (plan) => <div className="row-actions">
            <details className="plan-edit"><summary className="button button-secondary">Edit</summary>
              <form action={updatePlan} className="record-form plan-edit-form">
                <input type="hidden" name="id" value={plan.id} />
                <label>Plan name<input name="name" required maxLength={120} defaultValue={plan.name} /></label>
                <label>Duration in days<input name="duration_days" type="number" min={1} max={3650} step={1} required defaultValue={plan.duration_days} /></label>
                <label>Price ({currency})<input name="price" type="number" min={0} max={10000000} step="0.01" required defaultValue={Number(plan.price).toFixed(2)} /></label>
                <label>Description<textarea name="description" rows={2} maxLength={1000} defaultValue={plan.description || ""} /></label>
                <button className="button button-primary" type="submit">Save plan</button>
              </form>
            </details>
            <form action={setPlanActive}><input type="hidden" name="id" value={plan.id} /><input type="hidden" name="is_active" value={String(!plan.is_active)} /><button className="button button-ghost" type="submit">{plan.is_active ? "Deactivate" : "Activate"}</button></form>
          </div> },
        ]} />}
      </DataPanel>
      <DataPanel title="Create a plan" description="Use any name and duration that suits this gym.">
        <form action={createPlan} className="record-form">
          <label>Plan name<input name="name" required maxLength={120} placeholder="e.g. Strength 12-week" /></label>
          <label>Duration in days<input name="duration_days" type="number" min={1} max={3650} step={1} required /></label>
          <label>Price ({currency})<input name="price" type="number" min={0} max={10000000} step="0.01" required /></label>
          <label>Description<textarea name="description" rows={3} maxLength={1000} /></label>
          <button className="button button-primary" type="submit">Create plan</button>
        </form>
      </DataPanel>
    </div>
  </>;
}
