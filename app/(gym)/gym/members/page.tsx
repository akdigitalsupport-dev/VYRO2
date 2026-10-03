import Link from "next/link";
import { createMember } from "@/lib/gym/actions";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { ServerTable } from "@/components/server-table";
import { formatDate } from "@/lib/dashboard-data";

type MemberRow = { id: string; member_code: string; full_name: string; phone: string | null; status: string; membership_expires_on: string | null; membership_plan_id: string | null };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; error?: string; saved?: string }> }) {
  const params = await searchParams;
  const identity = await requireRole("gym_admin");
  const page = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const pageSize = 25;
  const q = params.q?.trim() || "";
  const status = ["active", "expiring", "expired", "paused"].includes(params.status || "") ? params.status! : "";
  const supabase = await createSupabaseServerClient();
  let request = supabase.from("members").select("id, member_code, full_name, phone, status, membership_expires_on, membership_plan_id", { count: "exact" })
    .eq("gym_id", identity.gymId!).is("archived_at", null).order("full_name", { ascending: true });
  if (q) request = request.ilike("full_name", `%${q.replace(/[,%_]/g, " ")}%`);
  if (status) request = request.eq("status", status);
  const [{ data, count, error }, plansResult] = await Promise.all([request.range((page - 1) * pageSize, page * pageSize - 1), supabase.from("membership_plans").select("id, name").eq("gym_id", identity.gymId!).eq("is_active", true).order("name")]);
  const planNames = new Map((plansResult.data || []).map((plan) => [plan.id, plan.name]));
  const rows = ((data || []) as MemberRow[]).map((member) => ({ ...member, planName: member.membership_plan_id ? planNames.get(member.membership_plan_id) || "Plan" : "No plan" }));
  return <>
    <DashboardHeader eyebrow="Gym workspace" title="Members" description="Search and manage this gym’s member records." />
    {params.error && <p className="form-error" role="alert">{params.error === "validation" ? "Review the member details and try again." : "The member could not be saved. Check that the member ID is unique."}</p>}
    {params.saved && <p className="success-message" role="status">Member archived.</p>}
    <div className="dashboard-columns">
      <DataPanel title="Member directory" description={`${count ?? 0} members match these filters`}>
        <form className="filter-row" action="/gym/members"><input name="q" defaultValue={q} placeholder="Search by name" aria-label="Search member name" /><select name="status" defaultValue={status} aria-label="Filter by status"><option value="">All statuses</option><option value="active">Active</option><option value="expiring">Expiring</option><option value="expired">Expired</option><option value="paused">Paused</option></select><button className="button" type="submit">Filter</button></form>
        {error ? <div className="empty-state"><strong>Members could not be loaded</strong><p>Check the database connection and retry.</p></div> : <ServerTable rows={rows} emptyTitle="No members found" emptyMessage={q || status ? "Adjust your search or status filter." : "Add a member to start the gym directory."} columns={[
          { label: "MEMBER", className: "table-primary", render: (member) => <Link href={`/gym/members/${member.id}`}>{member.full_name}</Link> },
          { label: "MEMBER ID", render: (member) => member.member_code },
          { label: "PLAN", render: (member) => member.planName },
          { label: "EXPIRES", render: (member) => formatDate(member.membership_expires_on) },
          { label: "STATUS", render: (member) => <span className={`status-badge ${member.status}`}>{member.status}</span> },
        ]} />}
        <div className="pagination"><span>Page {page}{count !== null ? ` of ${Math.max(1, Math.ceil(count / pageSize))}` : ""}</span><div><Link aria-disabled={page <= 1} href={`/gym/members?q=${encodeURIComponent(q)}&status=${status}&page=${Math.max(1, page - 1)}`}>Previous</Link><Link aria-disabled={!count || page * pageSize >= count} href={`/gym/members?q=${encodeURIComponent(q)}&status=${status}&page=${page + 1}`}>Next</Link></div></div>
      </DataPanel>
      <DataPanel title="Add a member" description="Membership dates and plan are optional at first entry.">
        <form className="record-form" action={createMember}>
          <label>Member ID<input name="member_code" required maxLength={40} /></label>
          <label>Full name<input name="full_name" required maxLength={160} /></label>
          <label>Phone<input name="phone" type="tel" maxLength={40} /></label>
          <label>Email<input name="email" type="email" maxLength={254} /></label>
          <label>Membership plan<select name="membership_plan_id" defaultValue=""><option value="">No plan yet</option>{(plansResult.data || []).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
          <div className="form-grid"><label>Starts<input name="membership_starts_on" type="date" /></label><label>Expires<input name="membership_expires_on" type="date" /></label></div>
          <button className="button button-primary" type="submit">Create member</button>
        </form>
      </DataPanel>
    </div>
  </>;
}
