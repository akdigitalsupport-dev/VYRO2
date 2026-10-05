import Link from "next/link";
import { DashboardHeader, DataPanel, MetricGrid, EmptyState } from "@/components/dashboard";
import { checkInMember } from "@/lib/gym/actions";
import { AttendanceFilterButton, AttendanceSubmitButton } from "@/components/attendance-submit-button";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/dashboard-data";
import { addIsoDays, isValidIsoDate, isValidTimeZone, localDateInTimeZone } from "@/lib/dates";

type SearchParams = { error?: string; saved?: string; range?: string; start?: string; end?: string; q?: string; page?: string };
type MemberRow = { id: string; full_name: string; member_code: string; status: string; archived_at?: string | null };
type AttendanceRow = { id: string; member_id: string; checked_in_at: string; attendance_date: string };
type MembershipRow = { member_id: string; start_date: string; end_date: string; status: string };
const PAGE_SIZE = 25;

function validMembership(memberships: MembershipRow[], day: string) {
  return memberships.some((membership) => membership.start_date <= day && membership.end_date >= day);
}

function pageUrl(params: SearchParams, page: number) {
  const query = new URLSearchParams();
  if (params.range) query.set("range", params.range);
  if (params.start) query.set("start", params.start);
  if (params.end) query.set("end", params.end);
  if (params.q) query.set("q", params.q);
  query.set("page", String(page));
  return `/gym/attendance?${query.toString()}`;
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [identity, params] = await Promise.all([requireRole("gym_admin"), searchParams]);
  const supabase = await createSupabaseServerClient();
  const { data: settings } = await supabase.from("gym_settings").select("timezone").eq("gym_id", identity.gymId!).maybeSingle();
  const timeZone = settings?.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : "Asia/Kolkata";
  const today = localDateInTimeZone(timeZone);
  const { data: dailySummary } = await supabase.rpc("get_gym_attendance_summary", { p_attendance_date: today });

  const range = params.range === "yesterday" || params.range === "custom" ? params.range : "today";
  let startDate = range === "yesterday" ? addIsoDays(today, -1) : today;
  let endDate = startDate;
  let invalidRange = false;
  if (range === "custom") {
    const customStart = params.start || "";
    const customEnd = params.end || "";
    if (!isValidIsoDate(customStart) || !isValidIsoDate(customEnd) || customStart > customEnd ||
      (new Date(`${customEnd}T00:00:00Z`).getTime() - new Date(`${customStart}T00:00:00Z`).getTime()) / 86400000 > 30) {
      invalidRange = true;
    } else {
      startDate = customStart;
      endDate = customEnd;
    }
  }
  const search = (params.q || "").trim().slice(0, 80);
  const page = Math.max(1, Number.isSafeInteger(Number(params.page)) ? Number(params.page) : 1);

  let memberMatches: MemberRow[] = [];
  if (search) {
    const pattern = `%${search}%`;
    const [nameMatches, codeMatches] = await Promise.all([
      supabase.from("members").select("id, full_name, member_code, status, archived_at")
        .eq("gym_id", identity.gymId!)
        .ilike("full_name", pattern).order("full_name").limit(15),
      supabase.from("members").select("id, full_name, member_code, status, archived_at")
        .eq("gym_id", identity.gymId!)
        .ilike("member_code", pattern).order("full_name").limit(15),
    ]);
    const byId = new Map<string, MemberRow>();
    for (const member of [...(nameMatches.data || []), ...(codeMatches.data || [])]) byId.set(member.id, member as MemberRow);
    memberMatches = [...byId.values()].slice(0, 20);
  }

  let members: MemberRow[] = [];
  let checkins: AttendanceRow[] = [];
  let total = 0;
  let loadError = false;
  if (!invalidRange && (!search || memberMatches.length)) {
    let request = supabase.from("attendance_records").select("id, member_id, checked_in_at, attendance_date", { count: "exact" })
      .eq("gym_id", identity.gymId!).gte("attendance_date", startDate).lte("attendance_date", endDate)
      .order("checked_in_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (search) request = request.in("member_id", memberMatches.map((member) => member.id));
    const result = await request;
    checkins = (result.data || []) as AttendanceRow[];
    total = result.count || 0;
    loadError = Boolean(result.error);
    const checkinIds = [...new Set(checkins.map((record) => record.member_id))];
    const ids = [...new Set([...checkinIds, ...memberMatches.map((member) => member.id)])];
    members = ids.length ? [...new Map([
      ...memberMatches.map((member) => [member.id, member] as const),
      ...(((await supabase.from("members").select("id, full_name, member_code, status, archived_at")
        .eq("gym_id", identity.gymId!).in("id", ids)).data || []) as MemberRow[]).map((member) => [member.id, member] as const),
    ]).values()] : memberMatches;
  }
  const candidateIds = memberMatches.filter((member) => member.status === "active" && !member.archived_at).map((member) => member.id);
  const checkinIds = [...new Set(checkins.map((record) => record.member_id))];
  const [candidateMemberships, historyMemberships] = await Promise.all([
    candidateIds.length ? supabase.from("member_memberships").select("member_id, start_date, end_date, status")
      .eq("gym_id", identity.gymId!).eq("status", "active").in("member_id", candidateIds)
      .lte("start_date", today).gte("end_date", today) : Promise.resolve({ data: [] }),
    checkinIds.length ? supabase.from("member_memberships").select("member_id, start_date, end_date, status")
      .eq("gym_id", identity.gymId!).in("member_id", checkinIds)
      .lte("start_date", endDate).gte("end_date", startDate).limit(1000) : Promise.resolve({ data: [] }),
  ]);
  const candidatesByMember = new Map<string, MembershipRow[]>();
  const historyByMember = new Map<string, MembershipRow[]>();
  for (const membership of (candidateMemberships.data || []) as MembershipRow[]) {
    const current = candidatesByMember.get(membership.member_id) || [];
    current.push(membership);
    candidatesByMember.set(membership.member_id, current);
  }
  for (const membership of (historyMemberships.data || []) as MembershipRow[]) {
    const current = historyByMember.get(membership.member_id) || [];
    current.push(membership);
    historyByMember.set(membership.member_id, current);
  }
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const summary = Array.isArray(dailySummary) ? dailySummary[0] : dailySummary;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const errorMessage: Record<string, string> = {
    validation: "Choose a valid member and try again.",
    duplicate: "Already checked in today.",
    member: "This member is inactive, archived, or unavailable.",
    membership: "This member does not have a currently valid membership.",
    save: "Check-in could not be recorded. Please try again.",
  };

  return <>
    <DashboardHeader eyebrow="Gym workspace" title="Attendance" description="Search for a member, confirm their active membership, and record today’s check-in." />
    {params.error && <p className="form-error" role="alert">{errorMessage[params.error] || errorMessage.save}</p>}
    {params.saved && <p className="success-message" role="status">Check-in recorded successfully.</p>}
    <MetricGrid metrics={[
      { label: "TODAY'S ATTENDANCE", value: summary ? String(summary.total_check_ins) : "—", detail: "Check-ins recorded today", tone: "accent" },
      { label: "UNIQUE CHECK-INS", value: summary ? String(summary.unique_check_ins) : "—", detail: "Members checked in today", tone: "good" },
    ]} />

    <div className="dashboard-columns">
      <DataPanel title="Recent check-ins" description={`${formatDate(startDate)}${endDate !== startDate ? ` to ${formatDate(endDate)}` : ""} · ${total} matching check-ins`}>
        <form className="filter-row attendance-filters" action="/gym/attendance" method="get">
          <label>Period<select name="range" defaultValue={range}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="custom">Custom range</option></select></label>
          <label>From<input name="start" type="date" defaultValue={range === "custom" ? startDate : ""} /></label>
          <label>To<input name="end" type="date" defaultValue={range === "custom" ? endDate : ""} /></label>
          <label>Search member<input name="q" type="search" maxLength={80} defaultValue={search} placeholder="Name or member ID" /></label>
          <AttendanceFilterButton />
        </form>
        {invalidRange && <p className="form-error" role="alert">Choose a valid date range of up to 31 days.</p>}
        {loadError ? <EmptyState title="Attendance could not be loaded" message="Please retry in a moment." /> : checkins.length === 0 ? <EmptyState title="No check-ins in this period" message="Search for a current member to record a check-in." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>MEMBER</th><th>MEMBER ID</th><th>CHECK-IN TIME</th><th>MEMBERSHIP STATUS</th></tr></thead><tbody>
          {checkins.map((record) => {
            const member = memberMap.get(record.member_id);
            const isValid = validMembership(historyByMember.get(record.member_id) || [], record.attendance_date);
            return <tr key={record.id}><td className="table-primary">{member ? <Link href={`/gym/members/${member.id}`}>{member.full_name}</Link> : "Member"}</td><td>{member?.member_code || "—"}</td><td>{formatDateTime(record.checked_in_at, timeZone)}</td><td><span className={`status-badge ${isValid ? "active" : "expired"}`}>{isValid ? "Valid at check-in" : "No active membership"}</span></td></tr>;
          })}
        </tbody></table></div>}
        {pageCount > 1 && <nav className="pagination" aria-label="Attendance pages"><span>Page {page} of {pageCount}</span>{page > 1 && <Link className="button" href={pageUrl(params, page - 1)}>Previous</Link>}{page < pageCount && <Link className="button" href={pageUrl(params, page + 1)}>Next</Link>}</nav>}
      </DataPanel>
      <DataPanel title="Check in a member" description="Search by name or member ID. The database checks the gym, member state, and membership before saving.">
        {search ? candidateIds.length === 0 ? <EmptyState title="No active member found" message="Try a name or member ID from your gym directory." /> : <div className="attendance-search-results">{memberMatches.filter((member) => candidateIds.includes(member.id)).map((member) => {
          const eligible = validMembership(candidatesByMember.get(member.id) || [], today);
          return <article className="attendance-search-result" key={member.id}><div><Link href={`/gym/members/${member.id}`}><strong>{member.full_name}</strong></Link><span>{member.member_code}</span><span className={`status-badge ${eligible ? "active" : "expired"}`}>{eligible ? "Membership valid" : "Membership not current"}</span></div><form action={checkInMember}><input type="hidden" name="member_id" value={member.id} /><AttendanceSubmitButton pendingLabel="Checking in…" disabled={!eligible}>Check in</AttendanceSubmitButton></form></article>;
        })}</div> : <p className="panel-body-copy">Enter a name or member ID in the search field, then choose the member to check in.</p>}
      </DataPanel>
    </div>
  </>;
}
