import Link from "next/link";
import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { ServerTable } from "@/components/server-table";
import { recordMemberPayment, updateMemberPaymentStatus } from "@/lib/gym/actions";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime, formatCurrency } from "@/lib/dashboard-data";
import { isValidIsoDate, isValidTimeZone, localMidnightAsUtc, addIsoDays } from "@/lib/dates";

type Search = { error?: string; saved?: string; page?: string; q?: string; status?: string; method?: string; from?: string; to?: string };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [identity, params] = await Promise.all([requireRole("gym_admin"), searchParams]);
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, Number.isSafeInteger(Number(params.page)) ? Number(params.page) : 1);
  const pageSize = 25;
  const [{ data: settings }, nameMatches, codeMatches] = await Promise.all([
    supabase.from("gym_settings").select("currency, timezone").eq("gym_id", identity.gymId!).maybeSingle(),
    params.q?.trim() ? supabase.from("members").select("id").eq("gym_id", identity.gymId!).is("archived_at", null).ilike("full_name", `%${params.q.trim()}%`).limit(100) : Promise.resolve({ data: [] }),
    params.q?.trim() ? supabase.from("members").select("id").eq("gym_id", identity.gymId!).is("archived_at", null).ilike("member_code", `%${params.q.trim()}%`).limit(100) : Promise.resolve({ data: [] }),
  ]);
  const timeZone = settings?.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : "Asia/Kolkata";
  let request = supabase.from("member_payments").select("id, member_id, amount, currency, payment_date, payment_method, reference, status", { count: "exact" })
    .eq("gym_id", identity.gymId!).order("payment_date", { ascending: false });
  if (params.status && ["pending", "completed", "failed", "refunded", "cancelled"].includes(params.status)) request = request.eq("status", params.status);
  if (params.method && ["cash", "upi", "card", "bank_transfer", "other"].includes(params.method)) request = request.eq("payment_method", params.method);
  if (params.from && isValidIsoDate(params.from)) request = request.gte("payment_date", localMidnightAsUtc(params.from, timeZone));
  if (params.to && isValidIsoDate(params.to)) request = request.lt("payment_date", localMidnightAsUtc(addIsoDays(params.to, 1), timeZone));
  if (params.q?.trim()) {
    const ids = [...new Set([...(nameMatches.data || []), ...(codeMatches.data || [])].map((member) => member.id))];
    request = ids.length ? request.in("member_id", ids) : request.eq("member_id", "00000000-0000-0000-0000-000000000000");
  }
  const { data, error, count } = await request.range((page - 1) * pageSize, page * pageSize - 1);
  const memberIds = [...new Set((data || []).map((payment) => payment.member_id))];
  const { data: resultMembers } = memberIds.length ? await supabase.from("members").select("id, full_name, member_code")
    .eq("gym_id", identity.gymId!).in("id", memberIds) : { data: [] };
  const memberMap = new Map((resultMembers || []).map((member) => [member.id, member]));
  const base = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value && key !== "page" && key !== "error" && key !== "saved") base.set(key, value);
  const pageCount = Math.max(1, Math.ceil((count || 0) / pageSize));
  return <><DashboardHeader eyebrow="Gym workspace" title="Payments" description="Track member payments. Gym receipts and VYRO subscription billing use separate ledgers." />
    {params.error && <p className="form-error" role="alert">{params.error === "member" ? "No active member matched that member code." : params.error === "transition" ? "That payment status transition is not allowed." : params.error === "validation" ? "Review the payment details and try again." : "Payment could not be updated."}</p>}
    {params.saved && <p className="success-message" role="status">{params.saved === "updated" ? "Payment status updated." : "Payment recorded as pending."}</p>}
    <div className="dashboard-columns">
      <DataPanel title="Member payment history" description="Filterable payment history. New offline receipts start as pending until confirmed.">
        <form method="get" className="record-form"><div className="form-grid"><label>Search member<input name="q" defaultValue={params.q} placeholder="Name or member code" /></label><label>Status<select name="status" defaultValue={params.status || ""}><option value="">All statuses</option>{["pending", "completed", "failed", "refunded", "cancelled"].map((status) => <option key={status}>{status}</option>)}</select></label><label>Method<select name="method" defaultValue={params.method || ""}><option value="">All methods</option>{["cash", "upi", "card", "bank_transfer", "other"].map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}</select></label><label>From<input type="date" name="from" defaultValue={params.from} /></label><label>To<input type="date" name="to" defaultValue={params.to} /></label></div><button className="button" type="submit">Apply filters</button></form>
        {error ? <div className="empty-state"><strong>Payments could not be loaded</strong><p>Check the database connection and retry.</p></div> : <ServerTable rows={(data || []).map((payment) => ({ ...payment, member: memberMap.get(payment.member_id) }))} emptyTitle="No payments found" emptyMessage="Try adjusting filters or record a member payment." columns={[
          { label: "MEMBER", className: "table-primary", render: (payment) => payment.member?.full_name || "Member" },
          { label: "AMOUNT", render: (payment) => formatCurrency(payment.amount, payment.currency) },
          { label: "METHOD", render: (payment) => payment.payment_method.replaceAll("_", " ") },
          { label: "DATE", render: (payment) => formatDateTime(payment.payment_date, timeZone) },
          { label: "STATUS", render: (payment) => <span className={`status-badge ${payment.status}`}>{payment.status}</span> },
          { label: "REFERENCE", render: (payment) => payment.reference || "—" },
          { label: "ACTIONS", render: (payment) => payment.status === "pending" || payment.status === "completed" ? <form action={updateMemberPaymentStatus} className="inline-form"><input type="hidden" name="payment_id" value={payment.id} /><select name="status" aria-label={`Update ${payment.id} status`} defaultValue=""><option value="" disabled>Set status</option>{payment.status === "pending" ? <><option value="completed">Complete</option><option value="failed">Failed</option><option value="cancelled">Cancel</option></> : <option value="refunded">Refund</option>}</select><button className="button" type="submit">Save</button></form> : "—" },
        ]} />}
        {pageCount > 1 && <nav className="pagination" aria-label="Payment pages"><span>Page {page} of {pageCount}</span>{page > 1 && <Link className="button" href={`/gym/payments?${new URLSearchParams([...base, ["page", String(page - 1)]])}`}>Previous</Link>}{page < pageCount && <Link className="button" href={`/gym/payments?${new URLSearchParams([...base, ["page", String(page + 1)]])}`}>Next</Link>}</nav>}
      </DataPanel>
      <DataPanel title="Record payment" description="Log an offline member payment; this does not contact a payment gateway.">
        <form action={recordMemberPayment} className="record-form"><label>Member code<input name="member_code" required maxLength={40} autoComplete="off" /></label><label>Amount ({settings?.currency || "INR"})<input name="amount" type="number" step="0.01" min="0.01" max="9999999999.99" required /></label><label>Method<select name="payment_method" defaultValue="cash"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label><label>Reference<input name="reference" maxLength={120} /></label><label>Notes<textarea name="notes" rows={2} maxLength={500} /></label><button className="button button-primary" type="submit">Record pending payment</button></form>
      </DataPanel>
    </div>
  </>;
}
