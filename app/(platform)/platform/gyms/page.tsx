import Link from "next/link";
import { createGym } from "@/lib/platform/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { ServerTable } from "@/components/server-table";
import { formatDate } from "@/lib/dashboard-data";

type GymRow = { id: string; name: string; owner_name: string | null; status: string; created_at: string };

export default async function GymsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; error?: string }> }) {
  const params = await searchParams;
  const query = params.q?.trim() || "";
  const page = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const pageSize = 20;
  const supabase = await createSupabaseServerClient();
  let request = supabase.from("gyms").select("id, name, owner_name, status, created_at", { count: "exact" }).order("created_at", { ascending: false });
  if (query) request = request.ilike("name", `%${query.replace(/[,%_]/g, " ")}%`);
  const { data, count, error } = await request.range((page - 1) * pageSize, page * pageSize - 1);
  return <>
    <DashboardHeader eyebrow="Platform management" title="Gyms" description="Manage the organizations using VYRO." />
    {params.error && <p className="form-error" role="alert">{params.error === "validation" ? "Check the gym details and try again." : "The change could not be saved. Please retry."}</p>}
    <div className="dashboard-columns">
      <DataPanel title="All gyms" description={`${count ?? 0} gyms on the platform`}>
        <form className="filter-row" action="/platform/gyms"><input name="q" defaultValue={query} placeholder="Search gym name" aria-label="Search gym name" /><button className="button" type="submit">Search</button></form>
        {error ? <div className="empty-state"><strong>Gyms could not be loaded</strong><p>Check the database connection and try again.</p></div> : <ServerTable rows={(data || []) as GymRow[]} emptyTitle="No gyms found" emptyMessage={query ? "Try another gym name." : "Create the first gym to start onboarding an organization."} columns={[
          { label: "GYM", className: "table-primary", render: (gym) => <Link href={`/platform/gyms/${gym.id}`}>{gym.name}</Link> },
          { label: "OWNER", render: (gym) => gym.owner_name || "—" },
          { label: "STATUS", render: (gym) => <span className={`status-badge ${gym.status}`}>{gym.status}</span> },
          { label: "ADDED", render: (gym) => formatDate(gym.created_at) },
        ]} />}
        <div className="pagination"><span>Page {page}{count !== null ? ` of ${Math.max(1, Math.ceil(count / pageSize))}` : ""}</span><div><Link aria-disabled={page <= 1} href={`/platform/gyms?q=${encodeURIComponent(query)}&page=${Math.max(1, page - 1)}`}>Previous</Link><Link aria-disabled={!count || page * pageSize >= count} href={`/platform/gyms?q=${encodeURIComponent(query)}&page=${page + 1}`}>Next</Link></div></div>
      </DataPanel>
      <DataPanel title="Add a gym" description="Start an organization record. Admin access is provisioned separately.">
        <form className="record-form" action={createGym}>
          <label>Gym name<input name="name" required minLength={2} maxLength={160} /></label>
          <label>Owner or primary contact<input name="owner_name" maxLength={160} /></label>
          <label>Phone<input name="phone" type="tel" maxLength={40} /></label>
          <label>Email<input name="email" type="email" maxLength={254} /></label>
          <label>Address<textarea name="address" rows={3} maxLength={500} /></label>
          <button className="button button-primary" type="submit">Create gym</button>
        </form>
      </DataPanel>
    </div>
  </>;
}
