import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardHeader, DataPanel, EmptyState } from "@/components/dashboard";
import { addMemberMembership, archiveMember, updateMember } from "@/lib/gym/actions";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/dashboard-data";
import { PlanDurationFields } from "@/components/plan-duration-fields";
import { isValidTimeZone, localDateInTimeZone } from "@/lib/dates";

type MembershipHistoryRow = {
  id: string;
  membership_plan_id: string;
  plan_name_snapshot: string;
  duration_days_snapshot: number;
  price_snapshot: number | string;
  start_date: string;
  end_date: string;
  status: "active" | "expired" | "cancelled";
  created_at: string;
};

export default async function MemberDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string; edit?: string; attendance_page?: string; payment_page?: string }> }) {
  const [{ id }, query, identity] = await Promise.all([params, searchParams, requireRole("gym_admin")]);
  const supabase = await createSupabaseServerClient();
  const attendancePage = Math.max(1, Number.isSafeInteger(Number(query.attendance_page)) ? Number(query.attendance_page) : 1);
  const attendancePageSize = 20;
  const paymentPage = Math.max(1, Number.isSafeInteger(Number(query.payment_page)) ? Number(query.payment_page) : 1);
  const paymentPageSize = 20;
  const [{ data: member, error }, { data: history, error: historyError }, { data: plans }, { data: settings }, { data: attendance, count: attendanceCount, error: attendanceError }, { data: payments, count: paymentCount, error: paymentError }] = await Promise.all([
    supabase.from("members").select("id, member_code, full_name, phone, email, gender, date_of_birth, address, notes, status, joining_date, created_at, archived_at")
      .eq("id", id).eq("gym_id", identity.gymId!).maybeSingle(),
    supabase.from("member_memberships")
      .select("id, membership_plan_id, plan_name_snapshot, duration_days_snapshot, price_snapshot, start_date, end_date, status, created_at")
      .eq("member_id", id).eq("gym_id", identity.gymId!).order("start_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("membership_plans").select("id, name, duration_days")
      .eq("gym_id", identity.gymId!).eq("is_active", true).order("name"),
    supabase.from("gym_settings").select("timezone, currency").eq("gym_id", identity.gymId!).maybeSingle(),
    supabase.from("attendance_records").select("id, attendance_date, checked_in_at", { count: "exact" })
      .eq("member_id", id).eq("gym_id", identity.gymId!).order("checked_in_at", { ascending: false })
      .range((attendancePage - 1) * attendancePageSize, attendancePage * attendancePageSize - 1),
    supabase.from("member_payments").select("id, amount, currency, payment_method, payment_date, status, reference", { count: "exact" })
      .eq("member_id", id).eq("gym_id", identity.gymId!).order("payment_date", { ascending: false })
      .range((paymentPage - 1) * paymentPageSize, paymentPage * paymentPageSize - 1),
  ]);
  if (error) return <div className="notice" role="alert">Member information could not be loaded.</div>;
  if (!member) notFound();
  const timeZone = settings?.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : "Asia/Kolkata";
  const today = localDateInTimeZone(timeZone);
  const memberships = (history || []) as unknown as MembershipHistoryRow[];
  const current = memberships.find((item) => item.status === "active" && item.start_date <= today && item.end_date >= today)
    || memberships.find((item) => item.status === "active") || memberships[0];

  return <>
    <DashboardHeader eyebrow={`Member ${member.member_code}`} title={member.full_name} description={`Joined ${formatDate(member.joining_date)} · ${member.status}`} />
    {query.saved === "1" && <p className="success-message" role="status">Member profile saved.</p>}
    {query.saved === "membership" && <p className="success-message" role="status">Membership added to the member’s history.</p>}
    {query.error && <p className="form-error" role="alert">{query.error === "membership" ? "Membership could not be added. Use an active plan and a non-overlapping date range." : "The member could not be updated. Review the fields and try again."}</p>}
    <div className="dashboard-columns">
      <DataPanel title="Member profile" description={member.archived_at ? "Archived profile retained for historical records." : "Contact information and member status."}>
        <dl className="details-grid">
          <div><dt>Member ID</dt><dd>{member.member_code}</dd></div>
          <div><dt>Status</dt><dd><span className={`status-badge ${member.status}`}>{member.status}</span></dd></div>
          <div><dt>Joining date</dt><dd>{formatDate(member.joining_date)}</dd></div>
          <div><dt>Phone</dt><dd>{member.phone || "—"}</dd></div>
          <div><dt>Email</dt><dd>{member.email || "—"}</dd></div>
          <div><dt>Gender</dt><dd>{member.gender?.replaceAll("_", " ") || "—"}</dd></div>
          <div><dt>Date of birth</dt><dd>{formatDate(member.date_of_birth)}</dd></div>
          <div><dt>Address</dt><dd>{member.address || "—"}</dd></div>
          <div><dt>Notes</dt><dd>{member.notes || "—"}</dd></div>
        </dl>
        {!member.archived_at && <details className="profile-edit" open={query.edit === "1"}>
          <summary>Edit profile</summary>
          <form className="record-form" action={updateMember}>
            <input type="hidden" name="id" value={member.id} />
            <label>Full name<input name="full_name" required maxLength={160} defaultValue={member.full_name} /></label>
            <div className="form-grid">
              <label>Phone<input name="phone" type="tel" maxLength={40} defaultValue={member.phone || ""} /></label>
              <label>Email<input name="email" type="email" maxLength={254} defaultValue={member.email || ""} /></label>
            </div>
            <div className="form-grid">
              <label>Gender<select name="gender" defaultValue={member.gender || ""}><option value="">Choose</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
              <label>Date of birth<input name="date_of_birth" type="date" defaultValue={member.date_of_birth || ""} /></label>
            </div>
            <label>Address<textarea name="address" rows={2} maxLength={500} defaultValue={member.address || ""} /></label>
            <label>Status<select name="status" defaultValue={member.status}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            <label>Notes<textarea name="notes" rows={3} maxLength={2000} defaultValue={member.notes || ""} /></label>
            <button className="button button-primary" type="submit">Save profile</button>
          </form>
        </details>}
        {!member.archived_at && <form action={archiveMember} className="archive-form"><input type="hidden" name="id" value={member.id} /><p>Archive hides this member from the active directory while preserving their profile and membership history.</p><button className="button button-danger" type="submit">Archive member</button></form>}
      </DataPanel>
      <div className="member-side-panels">
        <DataPanel title="Current membership" description="The latest active membership term for this member.">
          {current ? <dl className="details-grid">
            <div><dt>Current plan</dt><dd>{current.plan_name_snapshot}</dd></div>
            <div><dt>Membership status</dt><dd><span className={`status-badge ${current.status}`}>{current.status === "active" && current.end_date < today ? "expired" : current.status}</span></dd></div>
            <div><dt>Start date</dt><dd>{formatDate(current.start_date)}</dd></div>
            <div><dt>Expiry date</dt><dd>{formatDate(current.end_date)}</dd></div>
          </dl> : <EmptyState title="No membership history" message="Add an active plan to begin this member’s membership history." />}
          {!member.archived_at && (plans?.length ? <form className="record-form membership-form" action={addMemberMembership}>
            <input type="hidden" name="member_id" value={member.id} />
            <h3>Add membership</h3>
            <PlanDurationFields plans={plans} defaultStartDate={today} startFieldName="start_date" />
            <button className="button button-primary" type="submit">Add membership</button>
          </form> : <p className="panel-body-copy"><Link href="/gym/plans">Create or activate a plan</Link> before assigning membership.</p>)}
        </DataPanel>
        <DataPanel title="Membership history" description="Each renewal is stored as a separate record.">
          {historyError ? <EmptyState title="History unavailable" message="Membership history could not be loaded." /> : memberships.length === 0 ? <EmptyState title="No previous memberships" message="Membership records will appear here." /> : <div className="membership-history">{memberships.map((item, index) => {
            const effectiveStatus = item.status === "active" && item.end_date < today ? "expired" : item.status;
            const upcoming = item.start_date > today && item.status === "active";
            return <article className="history-entry" key={item.id}>
              <div className="history-entry-heading"><strong>{index === 0 && !upcoming ? "Latest" : upcoming ? "Upcoming" : "Previous"}</strong><span className={`status-badge ${effectiveStatus}`}>{effectiveStatus}</span></div>
              <p>{item.plan_name_snapshot} · {item.duration_days_snapshot} days · {new Intl.NumberFormat("en-IN", { style: "currency", currency: settings?.currency || "INR" }).format(Number(item.price_snapshot))}</p>
              <span>{formatDate(item.start_date)} → {formatDate(item.end_date)}</span>
            </article>;
          })}</div>}
        </DataPanel>
      </div>
    </div>
    <div style={{ marginTop: 14 }}><DataPanel title="Attendance history" description="Recent check-ins for this member.">
      {attendanceError ? <EmptyState title="Attendance history unavailable" message="Check-in history could not be loaded right now." /> : !attendance?.length ? <EmptyState title="No attendance recorded" message="This member’s check-ins will appear here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>DATE</th><th>CHECK-IN TIME</th></tr></thead><tbody>{attendance.map((record) => <tr key={record.id}><td>{formatDate(record.attendance_date)}</td><td>{formatDateTime(record.checked_in_at, timeZone)}</td></tr>)}</tbody></table></div>}
      {(attendanceCount || 0) > attendancePageSize && <nav className="pagination" aria-label="Member attendance pages"><span>Page {attendancePage} of {Math.ceil((attendanceCount || 0) / attendancePageSize)}</span>{attendancePage > 1 && <Link className="button" href={`/gym/members/${id}?attendance_page=${attendancePage - 1}`}>Previous</Link>}{attendancePage < Math.ceil((attendanceCount || 0) / attendancePageSize) && <Link className="button" href={`/gym/members/${id}?attendance_page=${attendancePage + 1}`}>Next</Link>}</nav>}
    </DataPanel></div>
    <div style={{ marginTop: 14 }}><DataPanel title="Payment history" description="Member receipts linked to this gym account.">
      {paymentError ? <EmptyState title="Payment history unavailable" message="Payment history could not be loaded right now." /> : !payments?.length ? <EmptyState title="No payments recorded" message="Payments for this member will appear here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>DATE</th><th>AMOUNT</th><th>METHOD</th><th>STATUS</th><th>REFERENCE</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td>{formatDateTime(payment.payment_date, timeZone)}</td><td>{formatCurrency(payment.amount, payment.currency || settings?.currency || "INR")}</td><td>{payment.payment_method.replaceAll("_", " ")}</td><td><span className={`status-badge ${payment.status}`}>{payment.status}</span></td><td>{payment.reference || "—"}</td></tr>)}</tbody></table></div>}
      {(paymentCount || 0) > paymentPageSize && <nav className="pagination" aria-label="Member payment pages"><span>Page {paymentPage} of {Math.ceil((paymentCount || 0) / paymentPageSize)}</span>{paymentPage > 1 && <Link className="button" href={`/gym/members/${id}?payment_page=${paymentPage - 1}`}>Previous</Link>}{paymentPage < Math.ceil((paymentCount || 0) / paymentPageSize) && <Link className="button" href={`/gym/members/${id}?payment_page=${paymentPage + 1}`}>Next</Link>}</nav>}
    </DataPanel></div>
  </>;
}
