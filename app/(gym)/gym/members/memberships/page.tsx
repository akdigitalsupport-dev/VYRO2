import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { MemberWorkspaceNav } from "@/components/members/member-workspace-nav";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dateInTimeZone, deriveMembershipStatus } from "@/lib/validation/member-finance";
import { formatInr } from "@/lib/money";

export const metadata: Metadata = { title: "Memberships" };

function localDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function statusVariant(status: string) {
  if (status === "active") return "positive" as const;
  if (status === "upcoming") return "warning" as const;
  if (status === "expired") return "danger" as const;
  return "default" as const;
}

export default async function MemberMembershipsPage() {
  const { gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const [{ data: memberships, error }, { data: settings }] = await Promise.all([
    supabase.from("member_memberships")
      .select("id, member_id, plan_name_snapshot, duration_days_snapshot, price_snapshot, start_date, end_date, status, created_at, members!inner(full_name, member_code, status, archived_at)")
      .eq("gym_id", gymId).neq("members.status", "archived").is("members.archived_at", null)
      .order("start_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
    supabase.from("gym_settings").select("timezone").eq("gym_id", gymId).maybeSingle(),
  ]);
  const today = dateInTimeZone(new Date(), settings?.timezone ?? "Asia/Kolkata");

  return <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
    <MemberWorkspaceNav active="memberships" />
    <PageHeader eyebrow="Members · history" title="Memberships" description="Current and previous membership periods, including their saved plan-price snapshots." />
    <CommandCenterCard title="Membership history">
      {error ? <ErrorState title="Memberships could not be loaded" description="Refresh the page and try again." /> : !memberships?.length ? <EmptyState icon={CalendarDays} title="No membership periods yet" description="Membership periods will appear here when you add or renew a member." action={{ label: "Add a member", href: "/gym/members/new" }} /> : <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Plan</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Price snapshot</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{memberships.map((row) => {
            const member = row.members as unknown as { full_name: string; member_code: string };
            const status = deriveMembershipStatus(row.status, row.start_date, row.end_date, today);
            return <TableRow key={row.id}>
              <TableCell className="min-w-40"><Link href={`/gym/members/${row.member_id}`} className="font-medium hover:text-accent">{member.full_name}</Link><span className="block font-mono text-xs text-muted-foreground">{member.member_code}</span></TableCell>
              <TableCell>{row.plan_name_snapshot}<span className="block text-xs text-muted-foreground">{row.duration_days_snapshot} days</span></TableCell>
              <TableCell className="whitespace-nowrap">{localDate(row.start_date)}</TableCell><TableCell className="whitespace-nowrap">{localDate(row.end_date)}</TableCell>
              <TableCell><Badge variant={statusVariant(status)}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge></TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatInr(Number(row.price_snapshot), { fractionDigits: 2 })}</TableCell>
              <TableCell><Button asChild size="sm" variant="ghost"><Link href={`/gym/members/${row.member_id}`}>View</Link></Button></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </div>}
      {memberships && memberships.length === 1000 ? <p className="mt-4 text-xs text-muted-foreground">Showing the latest 1,000 membership periods.</p> : null}
    </CommandCenterCard>
  </div>;
}
