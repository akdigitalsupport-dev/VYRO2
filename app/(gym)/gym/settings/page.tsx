import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { updateGymSettings } from "@/lib/gym/actions";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function GymSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [identity, params] = await Promise.all([requireRole("gym_admin"), searchParams]);
  const supabase = await createSupabaseServerClient();
  const [{ data: gym }, { data: settings, error }] = await Promise.all([
    supabase.from("gyms").select("name, phone, email, address").eq("id", identity.gymId!).maybeSingle(),
    supabase.from("gym_settings").select("timezone, currency").eq("gym_id", identity.gymId!).maybeSingle(),
  ]);
  return <><DashboardHeader eyebrow="Gym workspace" title="Gym settings" description="Manage regional defaults for this gym." />
    {params.saved && <p className="success-message" role="status">Gym settings saved.</p>}
    {params.error && <p className="form-error" role="alert">{params.error === "validation" ? "Check the timezone and currency values." : "Settings could not be saved."}</p>}
    <div className="dashboard-columns">
      <DataPanel title="Regional settings" description="These settings apply only to your gym workspace.">
        {error || !settings ? <div className="empty-state"><strong>Settings unavailable</strong><p>The gym settings record could not be loaded.</p></div> : <form action={updateGymSettings} className="record-form"><label>Timezone<input name="timezone" required maxLength={80} defaultValue={settings.timezone} /></label><label>Currency code<input name="currency" required minLength={3} maxLength={3} defaultValue={settings.currency} /></label><button className="button button-primary" type="submit">Save settings</button></form>}
      </DataPanel>
      <DataPanel title="Gym profile" description="These details are maintained by the VYRO platform owner.">
        <dl className="details-grid"><div><dt>Gym</dt><dd>{gym?.name || "—"}</dd></div><div><dt>Phone</dt><dd>{gym?.phone || "Not provided"}</dd></div><div><dt>Email</dt><dd>{gym?.email || "Not provided"}</dd></div><div><dt>Address</dt><dd>{gym?.address || "Not provided"}</dd></div></dl>
      </DataPanel>
    </div>
  </>;
}
