import type { Metadata } from "next";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { PageHeader } from "@/components/ui/page-header";
import { CheckInForm } from "@/components/attendance/check-in-form";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const metadata: Metadata = { title: "Attendance" };
function dayInZone(zone: string, date = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
export default async function AttendancePage() {
 const { gymId } = await requireGymAdminContext(); const supabase = await createServerSupabaseClient(); const { data: settings } = await supabase.from("gym_settings").select("timezone").eq("gym_id", gymId).maybeSingle(); const today = dayInZone(settings?.timezone ?? "Asia/Kolkata");
 const start = new Date(`${today}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 29); const from = start.toISOString().slice(0, 10);
 const [{ data: rows, error }, { data: summary }, { data: report, error: reportError }] = await Promise.all([
  supabase.from("attendance_records").select("id, member_id, attendance_date, checked_in_at, notes, members(full_name, member_code)").eq("gym_id", gymId).gte("attendance_date", from).lte("attendance_date", today).order("checked_in_at", { ascending: false }).limit(500),
  supabase.rpc("get_gym_attendance_summary", { p_attendance_date: today }),
  supabase.rpc("get_gym_report", { target_gym_id: gymId, p_from: from, p_to: today }),
 ]);
 const todayCount = Number(summary?.[0]?.total_check_ins ?? 0);
 return <div className="mx-auto max-w-[1400px] space-y-6"><PageHeader eyebrow="Operations" title="Attendance" description={`Check-in for ${today}. Only active members with a valid membership can check in.`}/>
  <CommandCenterCard title="Member check-in"><CheckInForm/></CommandCenterCard>
  <div className="grid gap-4 md:grid-cols-3"><CommandCenterCard title="Today"><p className="font-display text-3xl font-semibold">{todayCount}</p><p className="text-sm text-muted-foreground">Check-ins in gym timezone</p></CommandCenterCard><CommandCenterCard title="Recent activity"><p className="font-display text-3xl font-semibold">{rows?.length ?? 0}</p><p className="text-sm text-muted-foreground">Records over the last 30 days (up to 500)</p></CommandCenterCard><CommandCenterCard title="Duplicate control"><p className="text-sm text-muted-foreground">One check-in per member per gym-local day. Repeat scans are safely ignored.</p></CommandCenterCard></div>
  <CommandCenterCard title="Attendance trend · last 30 days">{reportError ? <p role="alert" className="text-sm text-destructive">Attendance trend could not be loaded.</p> : (() => { const points = (report?.attendance?.by_day ?? []) as Array<{ date: string; check_ins: number }>; const max = Math.max(1, ...points.map((p) => Number(p.check_ins))); return points.length ? <div className="flex h-40 items-end gap-1 overflow-x-auto">{points.map((point) => <div key={point.date} className="group flex h-full min-w-4 flex-1 flex-col justify-end" title={`${point.date}: ${point.check_ins} check-ins`}><div className="rounded-t bg-positive/70" style={{ height: `${Math.max(2, Number(point.check_ins) / max * 100)}%` }}/><span className="mt-1 truncate text-center text-[9px] text-muted-foreground">{point.date.slice(8)}</span></div>)}</div> : <p className="text-sm text-muted-foreground">No check-ins recorded in this period.</p>; })()}</CommandCenterCard>
  <CommandCenterCard title="Recent attendance">{error ? <p role="alert" className="text-sm text-destructive">Attendance history could not be loaded.</p> : !rows?.length ? <p className="rounded border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No check-ins in this period.</p> : <div className="space-y-2">{rows.map((row) => { const member = row.members as unknown as { full_name: string; member_code: string } | null; return <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2.5"><div><p className="font-medium">{member?.full_name ?? "Member"}</p><p className="font-mono text-xs text-muted-foreground">{member?.member_code ?? ""}</p></div><div className="text-right text-xs text-muted-foreground"><p>{row.attendance_date}</p><p>{new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: settings?.timezone ?? "Asia/Kolkata" }).format(new Date(row.checked_in_at))}</p></div></div>; })}</div>}</CommandCenterCard>
 </div>;
}
