import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { hasSupabaseConfig, createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PlatformSystemPage() {
  let database = false;
  if (hasSupabaseConfig()) {
    try { const supabase = await createSupabaseServerClient(); const { error } = await supabase.from("gyms").select("id").limit(1); database = !error; } catch { database = false; }
  }
  return <><DashboardHeader eyebrow="Platform operations" title="System health" description="Connection and security controls for this VYRO deployment." />
    <DataPanel title="Service status" description="Checks run at request time; no synthetic status is shown.">
      <div className="status-strip"><div className={`status-pill ${database ? "" : "warning"}`}><span />PostgreSQL {database ? "reachable" : "unavailable"}</div><div className={`status-pill ${hasSupabaseConfig() ? "" : "warning"}`}><span />Auth configuration {hasSupabaseConfig() ? "present" : "missing"}</div><div className="status-pill muted"><span />Background jobs not configured</div></div>
    </DataPanel>
    <div className="security-note"><strong>Security boundary</strong><p>Tenant data access is enforced by PostgreSQL row-level security. This page does not expose secret values or administrative keys.</p></div>
  </>;
}
