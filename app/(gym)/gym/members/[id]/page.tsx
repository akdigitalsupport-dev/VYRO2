import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Mail, Phone, UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { MemberPhotoControls } from "@/components/members/member-photo-controls";
import { ArchiveMemberButton } from "@/components/members/archive-member-button";
import { PermanentDeleteMemberButton } from "@/components/members/permanent-delete-member-button";
import { MembershipActions, RecordPaymentDialog, type MembershipPlanOption, type MemberMembershipOption } from "@/components/members/member-finance-controls";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { formatInr } from "@/lib/money";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dateInTimeZone, deriveMembershipStatus, memberPaymentStatusLabel, type MembershipUiStatus } from "@/lib/validation/member-finance";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateMembershipBilling, billingStatusLabel } from "@/lib/members/billing";
import { MemberWorkspaceNav } from "@/components/members/member-workspace-nav";

export const metadata: Metadata = { title: "Member profile" };

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

type MemberPaymentRow = {
  id: string;
  membership_id: string | null;
  amount: number | string;
  currency: string;
  payment_date: string;
  payment_method: "cash" | "upi" | "bank_transfer" | "card" | "other";
  status: "pending" | "completed" | "failed" | "refunded" | "cancelled";
  reference: string | null;
};

type RegistrationPaymentRow = {
  id: string;
  amount: number | string;
  currency: string;
  payment_date: string;
  payment_method: "cash" | "upi" | "bank_transfer" | "card" | "other";
  status: "completed" | "refunded";
  reference: string | null;
};

type MemberRow = {
  id: string;
  member_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive" | "archived";
  archived_at: string | null;
  joining_date: string;
  created_at: string;
  photo_path: string | null;
};

function displayDate(value: string | null) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}

function memberVariant(status: string) {
  if (status === "active") return "positive" as const;
  if (status === "inactive") return "warning" as const;
  return "default" as const;
}

function humanize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function membershipBadgeVariant(status: MembershipUiStatus) {
  if (status === "active") return "positive" as const;
  if (status === "upcoming") return "warning" as const;
  if (status === "expired") return "danger" as const;
  return "default" as const;
}

function paymentBadgeVariant(status: MemberPaymentRow["status"]) {
  if (status === "completed") return "positive" as const;
  if (status === "pending") return "warning" as const;
  if (status === "failed" || status === "refunded") return "danger" as const;
  return "default" as const;
}

function billingBadgeVariant(status: string) {
  if (status === "paid") return "positive" as const;
  if (status === "partially_paid") return "warning" as const;
  return "danger" as const;
}

function displayPaymentDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

function formatPaymentAmount(value: number | string, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value));
  } catch {
    return formatInr(Number(value), { fractionDigits: 2 });
  }
}

export default async function MemberProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const [
    { data: member, error: memberError },
    { data: history, error: historyError },
    { data: settings },
    { data: planRows },
    { data: paymentRows, error: paymentError },
    { data: registrationRow, error: registrationError },
  ] = await Promise.all([
    supabase
      .from("members")
      .select("id, member_code, full_name, phone, email, gender, date_of_birth, address, notes, status, archived_at, joining_date, created_at, photo_path")
      .eq("id", id)
      .eq("gym_id", gymId)
      .maybeSingle(),
    supabase
      .from("member_memberships")
      .select("id, membership_plan_id, plan_name_snapshot, duration_days_snapshot, price_snapshot, start_date, end_date, status, created_at")
      .eq("member_id", id)
      .eq("gym_id", gymId)
      .order("start_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("gym_settings").select("timezone, currency").eq("gym_id", gymId).maybeSingle(),
    supabase.from("membership_plans").select("id, name, duration_days, price").eq("gym_id", gymId).eq("is_active", true).order("name"),
    supabase
      .from("member_payments")
      .select("id, membership_id, amount, currency, payment_date, payment_method, status, reference")
      .eq("member_id", id)
      .eq("gym_id", gymId)
      .order("payment_date", { ascending: false })
      .limit(100),
    supabase.from("member_registration_payments")
      .select("id, amount, currency, payment_date, payment_method, status, reference")
      .eq("member_id", id).eq("gym_id", gymId).maybeSingle(),
  ]);

  if (memberError) {
    return <ErrorState title="Member profile unavailable" description="The member could not be loaded. Refresh the page and try again." />;
  }
  if (!member) notFound();

  const profile = member as MemberRow;
  const isArchived = profile.status === "archived" || Boolean(profile.archived_at);
  const { data: signedPhoto } = profile.photo_path
    ? await supabase.storage.from("vyro-member-photos").createSignedUrl(profile.photo_path, 3600)
    : { data: null };
  const memberships = (history ?? []) as MembershipHistoryRow[];
  const timeZone = settings?.timezone ?? "Asia/Kolkata";
  const today = dateInTimeZone(new Date(), timeZone);
  const membershipsWithStatus = memberships.map((membership) => ({
    ...membership,
    uiStatus: deriveMembershipStatus(membership.status, membership.start_date, membership.end_date, today),
  }));
  const currentMembership = membershipsWithStatus.find((membership) => membership.uiStatus === "active") ?? null;
  const upcomingMembership = membershipsWithStatus
    .filter((membership) => membership.uiStatus === "upcoming")
    .sort((first, second) => first.start_date.localeCompare(second.start_date))[0] ?? null;
  const featuredMembership = currentMembership ?? upcomingMembership ?? membershipsWithStatus[0] ?? null;
  const plans = (planRows ?? []) as MembershipPlanOption[];
  const payments = (paymentRows ?? []) as MemberPaymentRow[];
  const registrationPayment = registrationRow as RegistrationPaymentRow | null;
  const featuredPayments = featuredMembership ? payments.filter((payment) => payment.membership_id === featuredMembership.id) : [];
  const billing = featuredMembership ? calculateMembershipBilling(featuredMembership.price_snapshot, featuredPayments) : null;
  const latestPayment = featuredPayments.find((payment) => payment.status === "completed") ?? null;
  const created = Array.isArray(query.created) ? query.created[0] === "1" : query.created === "1";

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <MemberWorkspaceNav active="members" />
      {created ? (
        <p role="status" className="rounded-md border border-positive/30 bg-positive/10 px-4 py-3 text-sm text-positive">
          Member, membership, and applicable first-time registration payment saved successfully.
        </p>
      ) : null}
      <PageHeader
        eyebrow={`Member profile · ${profile.member_code}`}
        title={profile.full_name}
        description="Member details, current membership, and latest payment."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link href="/gym/members"><ArrowLeft className="h-4 w-4" />Members</Link></Button>
          {!isArchived ? <Button asChild><Link href={`/gym/members/${profile.id}/edit`}>Edit details</Link></Button> : null}
          {!isArchived ? <ArchiveMemberButton memberId={profile.id} /> : null}
        </div>
      </PageHeader>

      {isArchived ? <p role="status" className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">This member is archived. Historical memberships, payments, attendance, and audit records remain available. New memberships and payments are disabled.</p> : null}

      <CommandCenterCard title="Member photo">
        <MemberPhotoControls memberId={profile.id} memberName={profile.full_name} photoUrl={signedPhoto?.signedUrl ?? null} />
      </CommandCenterCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.8fr)]">
        <CommandCenterCard title="Member details">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant={memberVariant(isArchived ? "archived" : profile.status)}>{isArchived ? "Archived" : humanize(profile.status)}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{profile.member_code}</span>
          </div>
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Phone</dt>
              <dd className="mt-1.5 flex min-w-0 items-center gap-2 text-sm">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {profile.phone ? <a href={`tel:${profile.phone}`} className="truncate hover:text-accent">{profile.phone}</a> : "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Email</dt>
              <dd className="mt-1.5 flex min-w-0 items-center gap-2 text-sm">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {profile.email ? <a href={`mailto:${profile.email}`} className="truncate hover:text-accent">{profile.email}</a> : "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Joining date</dt>
              <dd className="mt-1.5 flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{displayDate(profile.joining_date)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Date of birth</dt>
              <dd className="mt-1.5 flex items-center gap-2 text-sm"><UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{displayDate(profile.date_of_birth)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Gender</dt>
              <dd className="mt-1.5 text-sm">{profile.gender ? humanize(profile.gender.replaceAll("_", " ")) : "Not provided"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Address</dt>
              <dd className="mt-1.5 whitespace-pre-wrap text-sm leading-6">{profile.address || "Not provided"}</dd>
            </div>
            {profile.notes ? (
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Notes</dt>
                <dd className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{profile.notes}</dd>
              </div>
            ) : null}
          </dl>
        </CommandCenterCard>

      <CommandCenterCard title="Current membership">
          <div className="space-y-5">
            {historyError ? (
              <p className="text-sm text-muted-foreground">Membership status could not be loaded.</p>
            ) : !featuredMembership ? (
              <EmptyState icon={CalendarDays} title="No membership history" description="Assign a plan to start this member’s membership history." />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="mt-1 font-display text-lg font-semibold">{featuredMembership.plan_name_snapshot}</p>
                  </div>
                  <Badge variant={membershipBadgeVariant(featuredMembership.uiStatus)}>{humanize(featuredMembership.uiStatus)}</Badge>
                </div>
                <p className="text-sm font-medium tabular-nums">
                  {formatInr(Number(featuredMembership.price_snapshot), { fractionDigits: 2 })} · {featuredMembership.duration_days_snapshot.toLocaleString("en-IN")} days
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span>{displayDate(featuredMembership.start_date)}</span>
                  <span aria-hidden="true">→</span>
                  <span>{displayDate(featuredMembership.end_date)}</span>
                </div>
              </div>
            )}
            {!historyError && !isArchived ? (
              <div className="border-t border-border/70 pt-4">
                <MembershipActions
                  memberId={profile.id}
                  joiningDate={profile.joining_date}
                  today={today}
                  latestMembership={(memberships[0] as MemberMembershipOption | undefined) ?? null}
                  hasMembershipHistory={memberships.length > 0}
                  hasCurrentOrUpcomingMembership={Boolean(currentMembership || upcomingMembership)}
                  plans={plans}
                />
              </div>
            ) : null}
          </div>
      </CommandCenterCard>
      </div>

      <CommandCenterCard title="Billing">
        {featuredMembership && billing ? <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-sm text-muted-foreground">{featuredMembership.plan_name_snapshot} · membership price snapshot</p><Badge className="mt-2" variant={billingBadgeVariant(billing.status)}>{billingStatusLabel(billing.status)}</Badge></div>
            {!isArchived && featuredMembership.status !== "cancelled" ? <RecordPaymentDialog memberId={profile.id} membershipId={featuredMembership.id} outstanding={billing.outstanding} currency={settings?.currency ?? "INR"} today={today} /> : null}
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border/70 bg-background/35 p-4"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Total</dt><dd className="mt-1 font-display text-xl font-semibold tabular-nums">{formatPaymentAmount(billing.total, settings?.currency ?? "INR")}</dd></div>
            <div className="rounded-md border border-border/70 bg-background/35 p-4"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Paid</dt><dd className="mt-1 font-display text-xl font-semibold tabular-nums">{formatPaymentAmount(billing.paid, settings?.currency ?? "INR")}</dd></div>
            <div className="rounded-md border border-border/70 bg-background/35 p-4"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</dt><dd className="mt-1 font-display text-xl font-semibold tabular-nums">{formatPaymentAmount(billing.outstanding, settings?.currency ?? "INR")}</dd></div>
          </dl>
          {billing.hasHistoricalOverpayment ? <p role="status" className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">Historical payments exceed this membership’s saved price by {formatPaymentAmount(billing.paid - billing.total, settings?.currency ?? "INR")}. The original payment history is preserved; additional payments are blocked.</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/70 pt-4">
          {latestPayment ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest payment · {memberPaymentStatusLabel(latestPayment.status)}</p>
              <p className="mt-1 font-display text-xl font-semibold tabular-nums">{formatPaymentAmount(latestPayment.amount, latestPayment.currency || settings?.currency || "INR")}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{humanize(latestPayment.payment_method.replaceAll("_", " "))}</span>
                <span aria-hidden="true">·</span>
                <span>{displayPaymentDate(latestPayment.payment_date, timeZone)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No payment recorded yet.</p>
          )}
          </div>
        </div> : <p className="text-sm text-muted-foreground">Assign a membership to see its billing balance.</p>}
      </CommandCenterCard>

      <CommandCenterCard title="Registration payment">
        {registrationError ? <ErrorState title="Registration payment unavailable" description="The separate registration transaction could not be loaded." /> : registrationPayment ? <dl className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-border/70 bg-background/35 p-4"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Registration fee</dt><dd className="mt-1 font-display text-xl font-semibold tabular-nums">{formatPaymentAmount(registrationPayment.amount, registrationPayment.currency || settings?.currency || "INR")}</dd></div>
          <div className="rounded-md border border-border/70 bg-background/35 p-4"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Status</dt><dd className="mt-2"><Badge variant={registrationPayment.status === "completed" ? "positive" : "danger"}>{registrationPayment.status === "completed" ? "Paid" : "Refunded"}</Badge></dd></div>
          <div className="rounded-md border border-border/70 bg-background/35 p-4"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Method and date</dt><dd className="mt-1 text-sm">{humanize(registrationPayment.payment_method.replaceAll("_", " "))} · {displayPaymentDate(registrationPayment.payment_date, timeZone)}</dd></div>
          <div className="rounded-md border border-border/70 bg-background/35 p-4"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Reference</dt><dd className="mt-1 truncate text-sm">{registrationPayment.reference || "—"}</dd></div>
        </dl> : <p className="text-sm text-muted-foreground">No registration fee was recorded for this member.</p>}
      </CommandCenterCard>

      <CommandCenterCard title="Membership history">
        {historyError ? (
          <ErrorState title="Membership history unavailable" description="The member details are available, but membership history could not be loaded." />
        ) : memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">Membership periods will appear here after assignment or renewal.</p>
        ) : (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">View {memberships.length} membership {memberships.length === 1 ? "period" : "periods"}</summary>
            <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membershipsWithStatus.map((membership) => (
                  <TableRow key={membership.id}>
                    <TableCell className="min-w-40 font-medium">
                      <span className="block">{membership.plan_name_snapshot}</span>
                      {membership.id === currentMembership?.id ? <span className="text-xs font-normal text-accent">Current membership</span> : null}
                      {membership.id === upcomingMembership?.id ? <span className="text-xs font-normal text-warning">Upcoming membership</span> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{displayDate(membership.start_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{displayDate(membership.end_date)}</TableCell>
                    <TableCell><Badge variant={membershipBadgeVariant(membership.uiStatus)}>{humanize(membership.uiStatus)}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap">{membership.duration_days_snapshot.toLocaleString("en-IN")} days</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatInr(Number(membership.price_snapshot), { fractionDigits: 2 })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </details>
        )}
      </CommandCenterCard>

      <CommandCenterCard title="Payment history">
        {paymentError ? (
          <ErrorState title="Payment history unavailable" description="Payments could not be loaded. Refresh the page and try again." />
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Payments will appear here after they are recorded.</p>
        ) : (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">View {payments.length} payment {payments.length === 1 ? "record" : "records"}</summary>
            <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap">{displayPaymentDate(payment.payment_date, timeZone)}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium tabular-nums">{formatPaymentAmount(payment.amount, payment.currency || settings?.currency || "INR")}</TableCell>
                    <TableCell className="whitespace-nowrap">{humanize(payment.payment_method.replaceAll("_", " "))}</TableCell>
                    <TableCell><Badge variant={paymentBadgeVariant(payment.status)}>{memberPaymentStatusLabel(payment.status)}</Badge></TableCell>
                    <TableCell className="max-w-48 truncate">{payment.reference || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </details>
        )}
      </CommandCenterCard>

      {isArchived ? <CommandCenterCard title="Danger zone">
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <h2 className="font-semibold text-destructive">Permanently delete this member</h2>
          <p className="text-sm leading-6 text-muted-foreground">This removes the archived member, membership history, payment records, attendance records, and private photo. This cannot be undone.</p>
          <PermanentDeleteMemberButton memberId={profile.id} memberName={profile.full_name} />
        </div>
      </CommandCenterCard> : null}
    </div>
  );
}
