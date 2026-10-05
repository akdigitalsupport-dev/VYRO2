import Link from "next/link";
import { redirect } from "next/navigation";
import { archiveMember, createMember } from "@/lib/gym/actions";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardHeader, DataPanel, EmptyState } from "@/components/dashboard";
import { ServerTable } from "@/components/server-table";
import { PlanDurationFields } from "@/components/plan-duration-fields";
import { formatDate } from "@/lib/dashboard-data";
import { isValidTimeZone, localDateInTimeZone } from "@/lib/dates";

type MemberDirectoryRow = {
  id: string;
  member_code: string;
  full_name: string;
  phone: string | null;
  member_status: "active" | "inactive" | "archived";
  joining_date: string;
  plan_name: string | null;
  start_date: string | null;
  end_date: string | null;
  membership_status: "active" | "expiring" | "expired" | "cancelled" | "none";
};

type DirectoryResult = { total_count: number; rows: MemberDirectoryRow[] };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; membership?: string; page?: string; error?: string; saved?: string }> }) {
  const [identity, params] = await Promise.all([requireRole("gym_admin"), searchParams]);
  const requestedPage = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const page = Math.min(requestedPage, 100000);
  const pageSize = 25;
  const q = params.q?.trim().slice(0, 80) || "";
  const memberStatus = ["active", "inactive", "archived"].includes(params.status || "") ? params.status! : "";
  const membershipStatus = ["active", "expiring", "expired", "cancelled", "none"].includes(params.membership || "") ? params.membership! : "";
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: plansData, error: plansError }, { data: settings }] = await Promise.all([
    supabase.rpc("get_gym_member_directory", {
      p_search: q || null,
      p_member_status: memberStatus || null,
      p_membership_status: membershipStatus || null,
      p_page_size: pageSize,
      p_page_offset: (page - 1) * pageSize,
    }),
    supabase.from("membership_plans").select("id, name, duration_days")
      .eq("gym_id", identity.gymId!).eq("is_active", true).order("name"),
    supabase.from("gym_settings").select("timezone").eq("gym_id", identity.gymId!).maybeSingle(),
  ]);
  const timeZone = settings?.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : "Asia/Kolkata";
  const result = (Array.isArray(data) ? data[0] : data) as unknown as DirectoryResult | null;
  const rows = result?.rows || [];
  const count = Number(result?.total_count || 0);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  if (page > totalPages) {
    const query = new URLSearchParams({ ...(q ? { q } : {}), ...(memberStatus ? { status: memberStatus } : {}), ...(membershipStatus ? { membership: membershipStatus } : {}), page: String(totalPages) });
    redirect(`/gym/members?${query.toString()}`);
  }

  function pageHref(nextPage: number) {
    const query = new URLSearchParams({ ...(q ? { q } : {}), ...(memberStatus ? { status: memberStatus } : {}), ...(membershipStatus ? { membership: membershipStatus } : {}), page: String(nextPage) });
    return `/gym/members?${query.toString()}`;
  }

  return <>
    <DashboardHeader eyebrow="Gym workspace" title="Members" description="Search and manage this gym’s member records." />
    {params.error && <p className="form-error" role="alert">{
      params.error.includes("validation") ? "Review the required member and membership details." :
        params.error === "membership" ? "The membership could not be created. Check that the plan is active and the dates do not overlap existing history." :
          "The member could not be saved. Check the form and try again."
    }</p>}
    {params.saved === "archived" && <p className="success-message" role="status">Member archived. Its record and membership history are preserved.</p>}
    {params.saved === "membership" && <p className="success-message" role="status">Membership added to the member’s history.</p>}
    <div className="dashboard-columns">
      <DataPanel title="Member directory" description={`${count} members match these filters`}>
        <form className="filter-row" action="/gym/members">
          <input name="q" defaultValue={q} maxLength={80} placeholder="Search name, member ID or phone" aria-label="Search members" />
          <select name="status" defaultValue={memberStatus} aria-label="Filter member status">
            <option value="">Active directory</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option>
          </select>
          <select name="membership" defaultValue={membershipStatus} aria-label="Filter membership status">
            <option value="">All memberships</option><option value="active">Active</option><option value="expiring">Expiring soon</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option><option value="none">No membership</option>
          </select>
          <button className="button button-secondary" type="submit">Search</button>
        </form>
        {error ? <EmptyState title="Members could not be loaded" message="Check the database connection and retry." /> : <ServerTable rows={rows} emptyTitle="No members found" emptyMessage={q || memberStatus || membershipStatus ? "Adjust the search or filters." : "Create a member to start this gym’s directory."} columns={[
          { label: "MEMBER", className: "table-primary", render: (member) => <Link href={`/gym/members/${member.id}`}>{member.full_name}</Link> },
          { label: "MEMBER ID", render: (member) => member.member_code },
          { label: "PHONE", render: (member) => member.phone || "—" },
          { label: "PLAN", render: (member) => member.plan_name || "—" },
          { label: "START DATE", render: (member) => formatDate(member.start_date) },
          { label: "EXPIRY DATE", render: (member) => formatDate(member.end_date) },
          { label: "STATUS", render: (member) => <span className={`status-badge ${member.membership_status === "none" ? "neutral" : member.membership_status}`}>{member.member_status} · {member.membership_status}</span> },
          { label: "ACTIONS", render: (member) => <div className="row-actions">
            <Link className="button button-ghost" href={`/gym/members/${member.id}`}>View</Link>
            <Link className="button button-secondary" href={`/gym/members/${member.id}?edit=1`}>Edit</Link>
            {member.member_status !== "archived" && <form action={archiveMember}><input type="hidden" name="id" value={member.id} /><button className="button button-danger" type="submit">Archive</button></form>}
          </div> },
        ]} />}
        <div className="pagination"><span>{count} members · Page {page} of {totalPages}</span><div>
          <Link aria-disabled={page <= 1} href={pageHref(Math.max(1, page - 1))}>Previous</Link>
          <Link aria-disabled={page >= totalPages} href={pageHref(Math.min(totalPages, page + 1))}>Next</Link>
        </div></div>
      </DataPanel>
      <DataPanel title="Add a member" description="A member ID is generated automatically; every new member starts with a plan history record.">
        {plansError ? <EmptyState title="Plans unavailable" message="Membership plans could not be loaded." /> : plansData?.length ? <form className="record-form" action={createMember}>
          <label>Full name<input name="full_name" required maxLength={160} autoComplete="name" /></label>
          <label>Phone<input name="phone" type="tel" required minLength={7} maxLength={40} autoComplete="tel" /></label>
          <div className="form-grid">
            <label>Email <span className="table-muted">Optional</span><input name="email" type="email" maxLength={254} autoComplete="email" /></label>
            <label>Gender <span className="table-muted">Optional</span><select name="gender" defaultValue=""><option value="">Choose</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
          </div>
          <div className="form-grid">
            <label>Date of birth <span className="table-muted">Optional</span><input name="date_of_birth" type="date" /></label>
            <label>Joining date<input name="joining_date" type="date" required defaultValue={localDateInTimeZone(timeZone)} /></label>
          </div>
          <label>Address <span className="table-muted">Optional</span><textarea name="address" rows={2} maxLength={500} /></label>
          <PlanDurationFields plans={plansData} />
          <label>Notes <span className="table-muted">Optional</span><textarea name="notes" rows={2} maxLength={2000} /></label>
          <button className="button button-primary" type="submit">Add member</button>
        </form> : <EmptyState title="Create a plan first" message="Every new member needs an active membership plan. Create one before adding members." />}
      </DataPanel>
    </div>
  </>;
}
