import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { archiveMember, updateMember } from "@/lib/gym/actions";
import { formatDate } from "@/lib/dashboard-data";

export default async function MemberDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [{ id }, query, identity] = await Promise.all([params, searchParams, requireRole("gym_admin")]);
  const supabase = await createSupabaseServerClient();
  const [{ data: member, error }, { data: plan }] = await Promise.all([
    supabase.from("members").select("id, member_code, full_name, phone, email, address, notes, status, membership_starts_on, membership_expires_on, created_at, archived_at").eq("id", id).eq("gym_id", identity.gymId!).maybeSingle(),
    supabase.from("membership_plans").select("name").eq("gym_id", identity.gymId!).eq("is_active", true).limit(100),
  ]);
  if (error) return <div className="notice" role="alert">Member information could not be loaded.</div>;
  if (!member) notFound();
  return <>
    <DashboardHeader eyebrow={`Member ${member.member_code}`} title={member.full_name} description={`Joined ${formatDate(member.created_at)} · ${plan?.length ?? 0} active plans available`} />
    {query.saved && <p className="success-message" role="status">Member details saved.</p>}
    {query.error && <p className="form-error" role="alert">The member could not be updated. Review the fields and try again.</p>}
    <div className="dashboard-columns">
      <DataPanel title="Member information" description={member.archived_at ? "This member has been archived." : "Update contact details, membership dates and status."}>
        {member.archived_at ? <div className="empty-state"><strong>Archived member record</strong><p>Archived records are preserved for historical attendance and payment references.</p></div> : <>
        <form className="record-form" action={updateMember}>
          <input type="hidden" name="id" value={member.id} />
          <label>Full name<input name="full_name" required maxLength={160} defaultValue={member.full_name} /></label>
          <div className="form-grid"><label>Phone<input name="phone" type="tel" maxLength={40} defaultValue={member.phone || ""} /></label><label>Email<input name="email" type="email" maxLength={254} defaultValue={member.email || ""} /></label></div>
          <label>Address<textarea name="address" rows={2} maxLength={500} defaultValue={member.address || ""} /></label>
          <div className="form-grid"><label>Starts<input name="membership_starts_on" type="date" defaultValue={member.membership_starts_on || ""} /></label><label>Expires<input name="membership_expires_on" type="date" defaultValue={member.membership_expires_on || ""} /></label></div>
          <label>Status<select name="status" defaultValue={member.status === "archived" ? "paused" : member.status}><option value="active">Active</option><option value="expiring">Expiring</option><option value="expired">Expired</option><option value="paused">Paused</option></select></label>
          <label>Notes<textarea name="notes" rows={3} maxLength={2000} defaultValue={member.notes || ""} /></label>
          <button className="button button-primary" type="submit">Save changes</button>
        </form>
        </>}
      </DataPanel>
      <DataPanel title="Membership" description="Current member status and safe archival.">
        <dl className="details-grid"><div><dt>Member ID</dt><dd>{member.member_code}</dd></div><div><dt>Plan start</dt><dd>{formatDate(member.membership_starts_on)}</dd></div><div><dt>Plan expiry</dt><dd>{formatDate(member.membership_expires_on)}</dd></div><div><dt>Status</dt><dd><span className={`status-badge ${member.status}`}>{member.status}</span></dd></div><div><dt>Archived</dt><dd>{member.archived_at ? formatDate(member.archived_at) : "No"}</dd></div></dl>
        {!member.archived_at && <form action={archiveMember} className="archive-form"><input type="hidden" name="id" value={member.id} /><p>Archive hides this record from the active directory while preserving payment and attendance history.</p><button className="button button-danger" type="submit">Archive member</button></form>}
      </DataPanel>
    </div>
  </>;
}
