import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, UserRoundPlus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { MemberPhotoViewer } from "@/components/members/member-photo-viewer";
import { ArchiveMemberButton } from "@/components/members/archive-member-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Label } from "@/components/ui/label";
import { Search } from "@/components/ui/search";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dateInTimeZone, deriveMembershipStatus } from "@/lib/validation/member-finance";
import { MemberWorkspaceNav } from "@/components/members/member-workspace-nav";

export const metadata: Metadata = { title: "Members" };

const pageSize = 25;
const memberStatuses = ["active", "inactive", "archived"] as const;
const membershipStatuses = ["active", "expiring", "expired", "cancelled", "none"] as const;

type MemberDirectoryRow = {
  id: string;
  member_code: string;
  full_name: string;
  photo_url: string | null;
  phone: string | null;
  member_status: (typeof memberStatuses)[number];
  joining_date: string;
  membership_plan_id: string | null;
  plan_name: string | null;
  start_date: string | null;
  end_date: string | null;
  membership_status: (typeof membershipStatuses)[number] | "upcoming";
  payment_status?: string | null;
};

type MemberSearchParams = {
  q?: string | string[];
  member_status?: string | string[];
  membership_status?: string | string[];
  page?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validStatus<T extends readonly string[]>(value: string, options: T): T[number] | null {
  return options.includes(value) ? value as T[number] : null;
}

function displayDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function memberBadge(status: string) {
  if (status === "active") return "positive" as const;
  if (status === "inactive") return "warning" as const;
  return "default" as const;
}

function membershipBadge(status: string) {
  if (status === "active") return "positive" as const;
  if (status === "expiring" || status === "upcoming") return "warning" as const;
  if (status === "expired") return "danger" as const;
  return "default" as const;
}

function humanize(value: string) {
  if (value === "none") return "No membership";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function memberInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "V";
}

function pageHref(page: number, query: { q: string; memberStatus: string; membershipStatus: string }) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.memberStatus) params.set("member_status", query.memberStatus);
  if (query.membershipStatus) params.set("membership_status", query.membershipStatus);
  params.set("page", String(page));
  return `/gym/members?${params.toString()}`;
}

function MemberCard({ member }: { member: MemberDirectoryRow }) {
  return (
    <article className="rounded-lg border border-border/80 bg-surface p-4 shadow-sm">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <MemberPhotoViewer src={member.photo_url} alt={`${member.full_name} photo`}>
            <Avatar initials={memberInitials(member.full_name)} src={member.photo_url ?? undefined} alt={`${member.full_name} photo`} className="h-12 w-12 shrink-0 rounded-full text-sm" />
          </MemberPhotoViewer>
          <div className="min-w-0">
            <Link href={`/gym/members/${member.id}`} className="block truncate font-display text-base font-semibold hover:text-accent">
              {member.full_name}
            </Link>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{member.member_code}</p>
          </div>
        </div>
        <Badge variant={memberBadge(member.member_status)}>{humanize(member.member_status)}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/70 pt-3 text-sm">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Contact</p>
          <p className="mt-1 truncate">{member.phone || "Not provided"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Joined</p>
          <p className="mt-1">{displayDate(member.joining_date)}</p>
        </div>
        <div className="col-span-2 flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Plan</p>
            <p className="mt-1 truncate">{member.plan_name ?? "No plan assigned"}</p>
          </div>
          <Badge variant={membershipBadge(member.membership_status)}>{humanize(member.membership_status)}</Badge>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Expires</p>
          <p className="mt-1">{displayDate(member.end_date)}</p>
        </div>
        <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 border-t border-border/70 pt-3">
          <Button asChild variant="ghost" size="sm"><Link href={`/gym/members/${member.id}`}>View</Link></Button>
          <Button asChild variant="secondary" size="sm"><Link href={`/gym/members/${member.id}/edit`}>Edit</Link></Button>
          {member.member_status !== "archived" ? <ArchiveMemberButton memberId={member.id} /> : null}
        </div>
      </div>
    </article>
  );
}

export default async function MembersPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { gymId } = await requireGymAdminContext();
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 80);
  const memberStatus = validStatus(first(params.member_status), memberStatuses);
  const membershipStatus = validStatus(first(params.membership_status), membershipStatuses);
  const requestedPage = Number.parseInt(first(params.page), 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100_000) : 1;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_gym_member_directory", {
    p_search: q || null,
    p_member_status: memberStatus,
    p_membership_status: membershipStatus,
    p_page_size: pageSize,
    p_page_offset: (page - 1) * pageSize,
  });

  const directory = data?.[0];
  const members = (Array.isArray(directory?.rows) ? directory.rows : []) as MemberDirectoryRow[];
  const memberIds = members.map((member) => member.id);
  // These reads are independent once the current page's member IDs are known.
  // Run them concurrently so settings and payment data do not wait for the photo path.
  const [{ data: photoRows }, { data: settings }, { data: paymentRows }] = await Promise.all([
    memberIds.length
      ? supabase.from("members").select("id, photo_path").eq("gym_id", gymId).in("id", memberIds)
      : Promise.resolve({ data: [] }),
    supabase.from("gym_settings").select("timezone").eq("gym_id", gymId).maybeSingle(),
    memberIds.length
      ? supabase.from("member_payments").select("member_id, status, payment_date").eq("gym_id", gymId).in("member_id", memberIds).order("payment_date", { ascending: false }).limit(500)
      : Promise.resolve({ data: [] }),
  ]);
  const photoPaths = (photoRows ?? []).map((member) => member.photo_path).filter((path): path is string => Boolean(path));
  const { data: signedPhotos } = photoPaths.length
    ? await supabase.storage.from("vyro-member-photos").createSignedUrls(photoPaths, 3600)
    : { data: [] };
  const today = dateInTimeZone(new Date(), settings?.timezone ?? "Asia/Kolkata");
  const signedUrlByPath = new Map((signedPhotos ?? []).map((photo) => [photo.path, photo.signedUrl]));
  const photoPathById = new Map((photoRows ?? []).map((member) => [member.id, member.photo_path]));
  const paymentStatusByMember = new Map<string, string>();
  for (const payment of paymentRows ?? []) if (!paymentStatusByMember.has(payment.member_id)) paymentStatusByMember.set(payment.member_id, payment.status);
  const membersWithPhotos = members.map((member) => ({
    ...member,
    photo_url: signedUrlByPath.get(photoPathById.get(member.id) ?? "") ?? null,
    payment_status: paymentStatusByMember.get(member.id) ?? null,
    membership_status: member.start_date && member.end_date
      ? deriveMembershipStatus(member.membership_status, member.start_date, member.end_date, today)
      : member.membership_status,
  }));
  const totalCount = Number(directory?.total_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const query = { q, memberStatus: memberStatus ?? "", membershipStatus: membershipStatus ?? "" };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <MemberWorkspaceNav active="members" />
      <PageHeader
        eyebrow="Gym workspace · directory"
        title="Members"
        description="Find members, check their current membership, and open their profile. The directory is scoped to your gym."
      >
        <Button asChild><Link href="/gym/members/new"><UserRoundPlus className="h-4 w-4" />Add member</Link></Button>
      </PageHeader>

      <form method="get" action="/gym/members" className="rounded-lg border border-border/80 bg-surface p-4 shadow-sm sm:p-5">
        <FilterBar>
          <div className="grid min-w-0 flex-1 gap-1.5 sm:min-w-64">
            <Label htmlFor="member-search">Search members</Label>
            <Search id="member-search" name="q" placeholder="Name, member code, or phone" defaultValue={q} />
          </div>
          <div className="grid min-w-36 gap-1.5">
            <Label htmlFor="member-status">Member status</Label>
            <select id="member-status" name="member_status" defaultValue={memberStatus ?? ""} className="h-10 rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/25">
              <option value="">All non-archived</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="grid min-w-40 gap-1.5">
            <Label htmlFor="membership-status">Membership status</Label>
            <select id="membership-status" name="membership_status" defaultValue={membershipStatus ?? ""} className="h-10 rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/25">
              <option value="">All memberships</option>
              <option value="active">Active</option>
              <option value="expiring">Expiring</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
              <option value="none">No membership</option>
            </select>
          </div>
          <Button type="submit">Apply</Button>
          {(q || memberStatus || membershipStatus) ? (
            <Button asChild type="button" variant="ghost"><Link href="/gym/members">Clear</Link></Button>
          ) : null}
        </FilterBar>
      </form>

      {error ? (
        <ErrorState title="Members could not be loaded" description="Your member directory is temporarily unavailable. Refresh the page and try again." />
      ) : totalCount === 0 ? (
        <EmptyState
          icon={UserRoundPlus}
          title={q || memberStatus || membershipStatus ? "No members match these filters" : "No members yet"}
          description={q || memberStatus || membershipStatus ? "Try a different search or clear the filters." : "Add your first member to start keeping gym records in one place."}
          action={q || memberStatus || membershipStatus ? { label: "Clear filters", href: "/gym/members" } : { label: "Add first member", href: "/gym/members/new" }}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <p><span className="font-semibold text-foreground">{totalCount.toLocaleString("en-IN")}</span> {totalCount === 1 ? "member" : "members"}</p>
            <p>Page {page} of {pageCount}</p>
          </div>

          <div className="space-y-3 md:hidden">
            {membersWithPhotos.map((member) => <MemberCard key={member.id} member={member} />)}
          </div>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Membership</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersWithPhotos.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <MemberPhotoViewer src={member.photo_url} alt={`${member.full_name} photo`}>
                          <Avatar initials={memberInitials(member.full_name)} src={member.photo_url ?? undefined} alt={`${member.full_name} photo`} className="h-10 w-10 shrink-0 rounded-full text-xs" />
                        </MemberPhotoViewer>
                        <div className="min-w-0">
                          <Link href={`/gym/members/${member.id}`} className="font-medium hover:text-accent">{member.full_name}</Link>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground">{member.member_code}</span>
                            <Badge variant={memberBadge(member.member_status)}>{humanize(member.member_status)}</Badge>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{member.payment_status === "completed" ? <Badge variant="positive">Paid</Badge> : member.payment_status ? <Badge variant={member.payment_status === "pending" ? "warning" : "danger"}>{humanize(member.payment_status)}</Badge> : <span className="text-sm text-muted-foreground">No payment</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{member.phone || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{member.plan_name ?? "No plan assigned"}</span>
                        <Badge variant={membershipBadge(member.membership_status)}>{humanize(member.membership_status)}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{displayDate(member.joining_date)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{displayDate(member.end_date)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="ghost" size="sm"><Link href={`/gym/members/${member.id}`}>View</Link></Button>
                        <Button asChild variant="secondary" size="sm"><Link href={`/gym/members/${member.id}/edit`}>Edit</Link></Button>
                        {member.member_status !== "archived" ? <ArchiveMemberButton memberId={member.id} /> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pageCount > 1 ? (
            <nav aria-label="Member directory pages" className="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
              <Button asChild variant="secondary" size="sm">
                <Link aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={page <= 1 ? "pointer-events-none opacity-50" : undefined} href={page <= 1 ? "#" : pageHref(page - 1, query)}><ArrowLeft className="h-4 w-4" />Previous</Link>
              </Button>
              <span className="text-xs text-muted-foreground">{totalCount.toLocaleString("en-IN")} results</span>
              <Button asChild variant="secondary" size="sm">
                <Link aria-disabled={page >= pageCount} tabIndex={page >= pageCount ? -1 : undefined} className={page >= pageCount ? "pointer-events-none opacity-50" : undefined} href={page >= pageCount ? "#" : pageHref(page + 1, query)}>Next<ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
