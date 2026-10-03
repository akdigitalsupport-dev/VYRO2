import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { ServerTable } from "@/components/server-table";
import { createPlan, setPlanActive } from "@/lib/gym/actions";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [identity, params] = await Promise.all([requireRole("gym_admin"), searchParams]);
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.from("membership_plans").select("id, name, duration_days, price, description, is_active")
      .eq("gym_id", identity.gymId!).order("is_active", { ascending: false }).order("name"),
    supabase.from("gym_settings").select("currency").eq("gym_id", identity.gymId!).maybeSingle(),
  ]);
  const currency = settings?.currency || "INR";
  return <><DashboardHeader eyebrow="Gym workspace" title="Membership plans" description="Set flexible durations and prices for your members." />
    {params.error && <p className="form-error" role="alert">{params.error === "validation" ? "Review the plan details." : "Plan could not be saved. A plan with that name may already exist."}</p>}
    {params.saved && <p className="success-message" role="status">Plan saved.</p>}
    <div className="dashboard-columns">
      <DataPanel title="Your plans" description="Inactive plans remain available on past member records.">
        {error ? <div className="empty-state"><strong>Plans could not be loaded</strong><p>Check the database connection and retry.</p></div> : <ServerTable rows={data || []} emptyTitle="No plans created" emptyMessage="Create your first flexible membership plan." columns={[
          { label: "PLAN", className: "table-primary", render: (plan) => plan.name },
          { label: "DURATION", render: (plan) => `${plan.duration_days} days` },
          { label: "PRICE", render: (plan) => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(plan.price)) },
          { label: "STATUS", render: (plan) => <form action={setPlanActive}><input type="hidden" name="id" value={plan.id} /><input type="hidden" name="is_active" value={String(!plan.is_active)} /><button className={`status-badge ${plan.is_active ? "" : "expired"}`} type="submit">{plan.is_active ? "Active · deactivate" : "Inactive · activate"}</button></form> },
        ]} />}
      </DataPanel>
      <DataPanel title="Create a plan" description="Duration is saved in days so plan names stay customizable.">
        <form action={createPlan} className="record-form"><label>Plan name<input name="name" required maxLength={120} placeholder="e.g. Strength 12-week" /></label><label>Duration in days<input name="duration_days" type="number" min={1} max={3650} step={1} required /></label><label>Price ({currency})<input name="price" type="number" min={0} max={10000000} step="0.01" required /></label><label>Description<textarea name="description" rows={3} maxLength={1000} /></label><button className="button button-primary" type="submit">Create plan</button></form>
      </DataPanel>
    </div>
  </>;
}
