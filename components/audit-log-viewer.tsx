import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dashboard-data";
import { addIsoDays, isValidIsoDate, isValidTimeZone, localMidnightAsUtc } from "@/lib/dates";
import { safeAuditMetadata } from "@/lib/reporting";
import { DataPanel, EmptyState } from "@/components/dashboard";

type Params = { audit_event?: string; audit_actor?: string; audit_from?: string; audit_to?: string; audit_page?: string };
type AuditRow = { id: string; actor_user_id: string | null; gym_id: string | null; action: string; entity_type: string; entity_id: string | null; metadata: unknown; created_at: string; gyms?: { name?: string } | null };

export async function AuditLogViewer({ scope, searchParams }: { scope: "gym" | "platform"; searchParams: Promise<Params> }) {
  const [identity, params] = await Promise.all([requireRole(scope === "gym" ? "gym_admin" : "platform_owner"), searchParams]);
  const supabase = await createSupabaseServerClient();
  const settingsQuery = scope === "gym"
    ? supabase.from("gym_settings").select("timezone").eq("gym_id", identity.gymId!).maybeSingle()
    : supabase.from("platform_settings").select("default_timezone").eq("id", 1).maybeSingle();
  const { data: settings } = await settingsQuery;
  const settingZone = scope === "gym" ? (settings as { timezone?: string } | null)?.timezone : (settings as { default_timezone?: string } | null)?.default_timezone;
  const timeZone = settingZone && isValidTimeZone(settingZone) ? settingZone : "Asia/Kolkata";
  const page = Math.max(1, Number.isSafeInteger(Number(params.audit_page)) ? Number(params.audit_page) : 1);
  const pageSize = 25;
  const actor = params.audit_actor?.trim();
  const actorValid = !actor || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actor);
  const from = params.audit_from;
  const to = params.audit_to;
  let rangeError = "";
  if (from && !isValidIsoDate(from) || to && !isValidIsoDate(to)) rangeError = "Enter valid audit dates.";
  if (from && to && isValidIsoDate(from) && isValidIsoDate(to) && from > to) rangeError = "Audit start date must be on or before end date.";
  if (from && to && isValidIsoDate(from) && isValidIsoDate(to) && (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 365) rangeError = "Audit date range must be 366 days or less.";
  let query = supabase.from("audit_logs").select("id, actor_user_id, gym_id, action, entity_type, entity_id, metadata, created_at, gyms(name)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (scope === "gym") query = query.eq("gym_id", identity.gymId!);
  if (params.audit_event?.trim()) query = query.eq("action", params.audit_event.trim().slice(0, 120));
  if (actor && actorValid) query = query.eq("actor_user_id", actor);
  if (from && isValidIsoDate(from)) query = query.gte("created_at", localMidnightAsUtc(from, timeZone).toISOString());
  if (to && isValidIsoDate(to)) query = query.lt("created_at", localMidnightAsUtc(addIsoDays(to, 1), timeZone).toISOString());
  if (!actorValid) rangeError = "Enter a valid actor ID.";
  const { data, error, count } = rangeError ? { data: null, error: null, count: 0 } : await query.range((page - 1) * pageSize, page * pageSize - 1);
  const actorIds = [...new Set((data || []).map((row) => row.actor_user_id).filter((id): id is string => Boolean(id)))];
  const { data: actors } = actorIds.length ? await supabase.from("user_profiles").select("user_id, display_name, role").in("user_id", actorIds) : { data: [] };
  const actorMap = new Map((actors || []).map((row) => [row.user_id, row.display_name || (row.role === "platform_owner" ? "Platform owner" : "Gym admin")]));
  const pageCount = Math.max(1, Math.ceil((count || 0) / pageSize));
  const pageHref = (nextPage: number) => {
    const search = new URLSearchParams();
    if (params.audit_event) search.set("audit_event", params.audit_event);
    if (params.audit_actor) search.set("audit_actor", params.audit_actor);
    if (params.audit_from) search.set("audit_from", params.audit_from);
    if (params.audit_to) search.set("audit_to", params.audit_to);
    search.set("audit_page", String(nextPage));
    return `?${search.toString()}`;
  };
  return <DataPanel title={scope === "gym" ? "Gym audit activity" : "Platform audit activity"} description="Recent security-aware activity from the existing audit log.">
    <form className="report-controls" method="get"><label>Event type<input name="audit_event" maxLength={120} placeholder="e.g. member_payment.refunded" defaultValue={params.audit_event} /></label><label>Actor ID<input name="audit_actor" placeholder="User UUID" defaultValue={params.audit_actor} /></label><label>From<input type="date" name="audit_from" defaultValue={from} /></label><label>To<input type="date" name="audit_to" defaultValue={to} /></label><button className="button" type="submit">Filter activity</button></form>
    {rangeError && <p className="form-error" role="alert">{rangeError}</p>}
    {error ? <EmptyState title="Audit log unavailable" message="Audit records could not be loaded right now." /> : !data?.length ? <EmptyState title="No audit events" message="Matching authorized audit events will appear here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>WHO</th>{scope === "platform" && <th>GYM</th>}<th>EVENT</th><th>ENTITY</th><th>REFERENCE</th><th>WHEN</th><th>DETAILS</th></tr></thead><tbody>{(data as unknown as AuditRow[]).map((event) => <tr key={event.id}><td>{event.actor_user_id ? actorMap.get(event.actor_user_id) || `User ${event.actor_user_id.slice(0, 8)}` : "System"}</td>{scope === "platform" && <td>{event.gyms?.name || "Platform"}</td>}<td className="table-primary">{event.action.replaceAll(".", " · ").replaceAll("_", " ")}</td><td>{event.entity_type.replaceAll("_", " ")}</td><td>{event.entity_id ? event.entity_id.slice(0, 8) : "—"}</td><td>{formatDateTime(event.created_at, timeZone)}</td><td><span className="audit-details">{safeAuditMetadata(event.metadata).map(([key, value]) => `${key}: ${value}`).join(" · ") || "—"}</span></td></tr>)}</tbody></table></div>}
    {pageCount > 1 && <nav className="pagination" aria-label="Audit log pages"><span>Page {page} of {pageCount}</span><div>{page > 1 && <Link href={pageHref(page - 1)}>Previous</Link>}{page < pageCount && <Link href={pageHref(page + 1)}>Next</Link>}</div></nav>}
  </DataPanel>;
}
