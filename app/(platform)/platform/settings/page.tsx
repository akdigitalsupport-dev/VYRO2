import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { savePlatformSettings } from "@/lib/platform/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PlatformSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [{ data, error }, params] = await Promise.all([
    (async () => { const supabase = await createSupabaseServerClient(); return supabase.from("platform_settings").select("brand_name, support_email, default_currency, default_timezone").eq("id", 1).maybeSingle(); })(),
    searchParams,
  ]);
  return <><DashboardHeader eyebrow="Platform configuration" title="Settings" description="Brand and default contact information for VYRO." />
    {params.saved && <p className="success-message" role="status">Platform settings saved.</p>}
    {params.error && <p className="form-error" role="alert">{params.error === "validation" ? "Review the settings and try again." : "Settings could not be saved."}</p>}
    <DataPanel title="Platform defaults" description="These defaults can be overridden for individual gyms where appropriate.">
      {error ? <div className="empty-state"><strong>Settings are unavailable</strong><p>Apply the database migration to initialize platform settings.</p></div> : data && <form action={savePlatformSettings} className="record-form settings-form">
        <label>Platform name<input name="brand_name" required minLength={1} maxLength={120} defaultValue={data.brand_name} /></label>
        <label>Support email<input name="support_email" type="email" maxLength={254} defaultValue={data.support_email || ""} /></label>
        <label>Default currency<input name="default_currency" required minLength={3} maxLength={3} defaultValue={data.default_currency} /></label>
        <label>Default timezone<input name="default_timezone" required maxLength={80} defaultValue={data.default_timezone} /></label>
        <button className="button button-primary" type="submit">Save settings</button>
      </form>}
    </DataPanel>
  </>;
}
