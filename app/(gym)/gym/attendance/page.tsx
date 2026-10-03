import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { ServerTable } from "@/components/server-table";
import { checkInMember } from "@/lib/gym/actions";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dashboard-data";
import { addIsoDays, isValidIsoDate, isValidTimeZone, localDateInTimeZone, localMidnightAsUtc } from "@/lib/dates";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; date?: string }> }) {
  const [identity, params] = await Promise.all([requireRole("gym_admin"), searchParams]);
  const supabase = await createSupabaseServerClient();
  const { data: settings } = await supabase.from("gym_settings").select("timezone").eq("gym_id", identity.gymId!).maybeSingle();
  const timeZone = settings?.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : "Asia/Kolkata";
  const date = params.date && isValidIsoDate(params.date) ? params.date : localDateInTimeZone(timeZone);
  const start = localMidnightAsUtc(date, timeZone).toISOString();
  const end = localMidnightAsUtc(addIsoDays(date, 1), timeZone).toISOString();
  const { data, error } = await supabase.from("attendance_records").select("id, member_id, checked_in_at, source")
    .eq("gym_id", identity.gymId!).gte("checked_in_at", start).lt("checked_in_at", end).order("checked_in_at", { ascending: false }).limit(100);
  const memberIds = [...new Set((data || []).map((entry) => entry.member_id))];
  const { data: members } = memberIds.length ? await supabase.from("members").select("id, full_name, member_code").eq("gym_id", identity.gymId!).in("id", memberIds) : { data: [] };
  const memberMap = new Map((members || []).map((member) => [member.id, member]));
  return <><DashboardHeader eyebrow="Gym workspace" title="Attendance" description="Record a member check-in and review recent attendance." />
    {params.error && <p className="form-error" role="alert">{params.error === "member" ? "No active member matched that ID." : params.error === "validation" ? "Enter a valid member ID." : "Check-in could not be saved."}</p>}
    {params.saved && <p className="success-message" role="status">Check-in recorded.</p>}
    <div className="dashboard-columns">
      <DataPanel title="Attendance history" description={`Check-ins recorded on ${date}`}>
        <form className="filter-row" action="/gym/attendance"><input name="date" type="date" defaultValue={date} /><button className="button" type="submit">Show date</button></form>
        {error ? <div className="empty-state"><strong>Attendance could not be loaded</strong><p>Check the database connection and retry.</p></div> : <ServerTable rows={(data || []).map((record) => ({ ...record, member: memberMap.get(record.member_id) }))} emptyTitle="No check-ins on this date" emptyMessage="A new member check-in will appear here." columns={[
          { label: "MEMBER", className: "table-primary", render: (record) => record.member?.full_name || "Member" },
          { label: "MEMBER ID", render: (record) => record.member?.member_code || "—" },
          { label: "CHECKED IN", render: (record) => formatDateTime(record.checked_in_at, timeZone) },
          { label: "SOURCE", render: (record) => record.source },
        ]} />}
      </DataPanel>
      <DataPanel title="Member check-in" description="Use the member ID from the gym directory.">
        <form action={checkInMember} className="record-form"><label>Member ID<input name="member_code" required maxLength={40} autoComplete="off" /></label><label>Note (optional)<textarea name="notes" rows={3} maxLength={500} /></label><button className="button button-primary" type="submit">Record check-in</button><p className="form-footnote">Only active, non-archived members can check in.</p></form>
      </DataPanel>
    </div>
  </>;
}
