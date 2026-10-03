import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { ServerTable } from "@/components/server-table";
import { recordMemberPayment } from "@/lib/gym/actions";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dashboard-data";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [identity, params] = await Promise.all([requireRole("gym_admin"), searchParams]);
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.from("member_payments").select("id, member_id, amount, currency, paid_at, payment_method, reference, status")
      .eq("gym_id", identity.gymId!).order("paid_at", { ascending: false }).limit(50),
    supabase.from("gym_settings").select("currency").eq("gym_id", identity.gymId!).maybeSingle(),
  ]);
  const currency = settings?.currency || "INR";
  const memberIds = [...new Set((data || []).map((payment) => payment.member_id))];
  const { data: members } = memberIds.length ? await supabase.from("members").select("id, full_name, member_code").eq("gym_id", identity.gymId!).in("id", memberIds) : { data: [] };
  const memberMap = new Map((members || []).map((member) => [member.id, member]));
  return <><DashboardHeader eyebrow="Gym workspace" title="Payments" description="Track money collected from members. This ledger is separate from VYRO subscriptions." />
    {params.error && <p className="form-error" role="alert">{params.error === "member" ? "No member matched that ID." : params.error === "validation" ? "Review the payment details and try again." : "Payment could not be recorded."}</p>}
    {params.saved && <p className="success-message" role="status">Payment recorded.</p>}
    <div className="dashboard-columns">
      <DataPanel title="Recent payments" description="Latest 50 member transactions.">
        {error ? <div className="empty-state"><strong>Payments could not be loaded</strong><p>Check the database connection and retry.</p></div> : <ServerTable rows={(data || []).map((payment) => ({ ...payment, member: memberMap.get(payment.member_id) }))} emptyTitle="No payments recorded" emptyMessage="Member payments will appear here when recorded." columns={[
          { label: "MEMBER", className: "table-primary", render: (payment) => payment.member?.full_name || "Member" },
          { label: "AMOUNT", render: (payment) => new Intl.NumberFormat("en-IN", { style: "currency", currency: payment.currency }).format(Number(payment.amount)) },
          { label: "METHOD", render: (payment) => payment.payment_method.replace("_", " ") },
          { label: "DATE", render: (payment) => formatDateTime(payment.paid_at) },
          { label: "STATUS", render: (payment) => <span className={`status-badge ${payment.status}`}>{payment.status}</span> },
        ]} />}
      </DataPanel>
      <DataPanel title="Record payment" description="Record an offline payment; no gateway is connected.">
        <form action={recordMemberPayment} className="record-form"><label>Member ID<input name="member_code" required maxLength={40} autoComplete="off" /></label><label>Amount ({currency})<input name="amount" type="number" step="0.01" min="0.01" max="10000000" required /></label><label>Method<select name="payment_method" defaultValue="cash"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label><label>Reference<input name="reference" maxLength={120} /></label><label>Notes<textarea name="notes" rows={2} maxLength={500} /></label><button className="button button-primary" type="submit">Record payment</button></form>
      </DataPanel>
    </div>
  </>;
}
