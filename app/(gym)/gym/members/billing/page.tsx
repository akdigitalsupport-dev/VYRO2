import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { MemberWorkspaceNav } from "@/components/members/member-workspace-nav";
import { RecordPaymentDialog } from "@/components/members/member-finance-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { calculateMembershipBilling, billingStatusLabel, type BillingStatus } from "@/lib/members/billing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dateInTimeZone } from "@/lib/validation/member-finance";

export const metadata: Metadata = { title: "Member billing" };

type BillingSearchParams = { status?: string | string[]; q?: string | string[] };
type MemberInfo = { full_name: string; member_code: string; status: string; archived_at: string | null };
type MembershipRow = {
  id: string;
  member_id: string;
  plan_name_snapshot: string;
  price_snapshot: number | string;
  start_date: string;
  end_date: string;
  status: string;
  members: MemberInfo;
};
type PaymentRow = { id: string; membership_id: string | null; amount: number | string; status: string; payment_date: string; payment_method: string; reference: string | null };
type RegistrationRow = { id: string; member_id: string; amount: number | string; currency: string; status: string; payment_date: string; payment_method: string; reference: string | null };
type RegistrationMember = { id: string; full_name: string; member_code: string };

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value); }
  catch { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value); }
}
function localDate(value: string | null, timeZone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(value));
}
function statusVariant(status: BillingStatus) {
  if (status === "paid") return "positive" as const;
  if (status === "partially_paid") return "warning" as const;
  return "danger" as const;
}

export default async function MembersBillingPage({ searchParams }: { searchParams: Promise<BillingSearchParams> }) {
  const { gymId } = await requireGymAdminContext();
  const params = await searchParams;
  const requestedStatus = first(params.status);
  const statusFilter = ["unpaid", "partially_paid", "paid"].includes(requestedStatus) ? requestedStatus as BillingStatus : "all";
  const query = first(params.q).trim().slice(0, 80);
  const supabase = await createServerSupabaseClient();
  const [{ data: membershipRows, error }, { data: settings }, { data: registrationRows, error: registrationError }, { data: registrationMembers, error: registrationMemberError }] = await Promise.all([
    supabase.from("member_memberships")
      .select("id, member_id, plan_name_snapshot, price_snapshot, start_date, end_date, status, members!inner(full_name, member_code, status, archived_at)")
      .eq("gym_id", gymId).neq("members.status", "archived").is("members.archived_at", null)
      .order("start_date", { ascending: false }).limit(1000),
    supabase.from("gym_settings").select("timezone, currency").eq("gym_id", gymId).maybeSingle(),
    supabase.from("member_registration_payments").select("id, member_id, amount, currency, status, payment_date, payment_method, reference").eq("gym_id", gymId).order("payment_date", { ascending: false }).limit(1000),
    supabase.from("members").select("id, full_name, member_code").eq("gym_id", gymId).limit(2000),
  ]);
  const memberships = (membershipRows ?? []) as unknown as MembershipRow[];
  const membershipIds = memberships.map((membership) => membership.id);
  const { data: paymentRows, error: paymentError } = membershipIds.length
    ? await supabase.from("member_payments").select("id, membership_id, amount, status, payment_date, payment_method, reference")
        .eq("gym_id", gymId).in("membership_id", membershipIds).order("payment_date", { ascending: false }).limit(10000)
    : { data: [] as PaymentRow[], error: null };
  const payments = (paymentRows ?? []) as PaymentRow[];
  const registrations = (registrationRows ?? []) as RegistrationRow[];
  const registrationMemberById = new Map(((registrationMembers ?? []) as RegistrationMember[]).map((member) => [member.id, member]));
  const rows = memberships.map((membership) => {
    const memberPayments = payments.filter((payment) => payment.membership_id === membership.id);
    return {
      membership,
      member: membership.members,
      billing: calculateMembershipBilling(membership.price_snapshot, memberPayments),
      lastPayment: memberPayments.find((payment) => payment.status === "completed") ?? null,
    };
  });
  const totalBilled = rows.reduce((sum, row) => sum + row.billing.total, 0);
  const collected = rows.reduce((sum, row) => sum + row.billing.paid, 0);
  const outstanding = rows.reduce((sum, row) => sum + row.billing.outstanding, 0);
  const counts = {
    unpaid: rows.filter((row) => row.billing.status === "unpaid").length,
    partially_paid: rows.filter((row) => row.billing.status === "partially_paid").length,
    paid: rows.filter((row) => row.billing.status === "paid").length,
  };
  const overpaymentExcess = rows.reduce((sum, row) => sum + Math.max(0, row.billing.paid - row.billing.total), 0);
  const currency = settings?.currency ?? "INR";
  const timeZone = settings?.timezone ?? "Asia/Kolkata";
  const today = dateInTimeZone(new Date(), timeZone);
  const visibleRows = rows.filter((row) => {
    if (statusFilter !== "all" && row.billing.status !== statusFilter) return false;
    if (!query) return true;
    const term = query.toLocaleLowerCase();
    return row.member.full_name.toLocaleLowerCase().includes(term) || row.member.member_code.toLocaleLowerCase().includes(term);
  });
  const registrationTotal = registrations.reduce((sum, row) => sum + (row.status === "completed" ? Number(row.amount) : 0), 0);
  const failed = Boolean(error || paymentError || registrationError || registrationMemberError);

  return <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
    <MemberWorkspaceNav active="billing" />
    <PageHeader eyebrow="Members · collections" title="Billing" description="See what each membership cost, what has been received, and what remains due." />
    {failed ? <ErrorState title="Billing could not be loaded" description="Membership balances could not be verified. Refresh the page and try again." /> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[["Total billed", totalBilled], ["Collected", collected], ["Outstanding", outstanding]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border/80 bg-surface p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 font-display text-xl font-semibold tabular-nums">{money(Number(value), currency)}</p></div>)}
        <div className="rounded-lg border border-border/80 bg-surface p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Partially paid</p><p className="mt-2 font-display text-xl font-semibold tabular-nums">{counts.partially_paid}</p></div>
        <div className="rounded-lg border border-border/80 bg-surface p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Unpaid</p><p className="mt-2 font-display text-xl font-semibold tabular-nums">{counts.unpaid}</p></div>
      </div>
      {overpaymentExcess > 0 ? <p role="status" className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">Some historical payments exceed their saved membership prices by {money(overpaymentExcess, currency)}. The history is preserved, balances do not go below zero, and additional payments against those periods are blocked.</p> : null}
      <CommandCenterCard title="Registration fee collections">
        <p className="mb-4 text-sm text-muted-foreground">One-time registration receipts are reported separately and never reduce membership balances.</p>
        <div className="mb-4 rounded-md border border-border/70 bg-background/35 p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Registration revenue received</p><p className="mt-1 font-display text-xl font-semibold tabular-nums">{money(registrationTotal, currency)}</p></div>
        {!registrations.length ? <p className="text-sm text-muted-foreground">No registration payments recorded yet.</p> : <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Amount</TableHead><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead>Reference</TableHead></TableRow></TableHeader>
          <TableBody>{registrations.map((registration) => { const member = registrationMemberById.get(registration.member_id); return <TableRow key={registration.id}>
            <TableCell>{member ? <Link href={`/gym/members/${member.id}`} className="font-medium hover:text-accent">{member.full_name}<span className="block font-mono text-xs text-muted-foreground">{member.member_code}</span></Link> : "Member record unavailable"}</TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{money(Number(registration.amount), registration.currency || currency)}</TableCell>
            <TableCell className="whitespace-nowrap">{localDate(registration.payment_date, timeZone)}</TableCell>
            <TableCell>{registration.payment_method.replaceAll("_", " ")}</TableCell>
            <TableCell><Badge variant={registration.status === "completed" ? "positive" : "danger"}>{registration.status === "completed" ? "Paid" : "Refunded"}</Badge></TableCell>
            <TableCell>{registration.reference || "—"}</TableCell>
          </TableRow>; })}</TableBody>
        </Table></div>}
      </CommandCenterCard>
      <CommandCenterCard title="Membership balances">
        <form method="get" action="/gym/members/billing" className="mb-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-xs text-muted-foreground">Search member or code<input name="q" defaultValue={query} placeholder="Name or member code" className="h-10 w-56 rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground" /></label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">Billing status<select name="status" defaultValue={statusFilter} className="h-10 rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground"><option value="all">All</option><option value="unpaid">Unpaid</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option></select></label>
          <Button type="submit" variant="secondary">Apply filters</Button>
          {query || statusFilter !== "all" ? <Button asChild variant="ghost"><Link href="/gym/members/billing">Clear</Link></Button> : null}
        </form>
        {!visibleRows.length ? <EmptyState icon={Wallet} title="No billing rows match" description="Try another filter, or add a member with a membership plan." action={{ label: "Add member", href: "/gym/members/new" }} /> : <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Plan</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead>Status</TableHead><TableHead>Last payment</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
            <TableBody>{visibleRows.map(({ membership, member, billing, lastPayment }) => <TableRow key={membership.id}>
              <TableCell className="min-w-40"><Link href={"/gym/members/" + membership.member_id} className="font-medium hover:text-accent">{member.full_name}</Link><span className="block font-mono text-xs text-muted-foreground">{member.member_code}</span></TableCell>
              <TableCell className="min-w-32">{membership.plan_name_snapshot}</TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">{money(billing.total, currency)}</TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">{money(billing.paid, currency)}</TableCell>
              <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{money(billing.outstanding, currency)}</TableCell>
              <TableCell><Badge variant={statusVariant(billing.status)}>{billingStatusLabel(billing.status)}</Badge>{billing.hasHistoricalOverpayment ? <span className="mt-1 block text-xs text-warning">Historical overpayment</span> : null}</TableCell>
              <TableCell className="whitespace-nowrap">{lastPayment ? localDate(lastPayment.payment_date, timeZone) : "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{billing.outstanding > 0 && membership.status !== "cancelled" ? <RecordPaymentDialog memberId={membership.member_id} membershipId={membership.id} outstanding={billing.outstanding} currency={currency} today={today} /> : <Button asChild size="sm" variant="ghost"><Link href={"/gym/members/" + membership.member_id}>View</Link></Button>}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>}
        {memberships.length === 1000 ? <p className="mt-4 text-xs text-muted-foreground">Showing the latest 1,000 membership periods.</p> : null}
      </CommandCenterCard>
    </>}
  </div>;
}
