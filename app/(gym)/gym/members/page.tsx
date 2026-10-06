import { redirect } from "next/navigation";
import MemberDirectory from "@/components/member-directory";
import { requireRole } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MemberDirectoryRow = {
  id: string;
  member_code: string;
  full_name: string;
  phone: string | null;
  member_status: "active" | "inactive" | "archived";
  joining_date: string;
  plan_name: string | null;
  start_date: string | null;
  end_date: string | null;
  membership_status: "active" | "expiring" | "expired" | "cancelled" | "none";
};

type DirectoryResult = { total_count: number; rows: MemberDirectoryRow[] };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; membership?: string; page?: string; error?: string; saved?: string }> }) {
  const [identity, params] = await Promise.all([requireRole("gym_admin"), searchParams]);
  const requestedPage = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const page = Math.min(requestedPage, 100000);
  const pageSize = 25;
  const q = params.q?.trim().slice(0, 80) || "";
  const memberStatus = ["active", "inactive", "archived"].includes(params.status || "") ? params.status! : "";
  const membershipStatus = ["active", "expiring", "expired", "cancelled", "none"].includes(params.membership || "") ? params.membership! : "";
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: plansData, error: plansError }] = await Promise.all([
    supabase.rpc("get_gym_member_directory", {
      p_search: q || null,
      p_member_status: memberStatus || null,
      p_membership_status: membershipStatus || null,
      p_page_size: pageSize,
      p_page_offset: (page - 1) * pageSize,
    }),
    supabase.from("membership_plans").select("id, name, duration_days")
      .eq("gym_id", identity.gymId!).eq("is_active", true).order("name"),
  ]);

  const result = (Array.isArray(data) ? data[0] : data) as unknown as DirectoryResult | null;
  const rows = result?.rows || [];
  const count = Number(result?.total_count || 0);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  if (page > totalPages) {
    const query = new URLSearchParams({ ...(q ? { q } : {}), ...(memberStatus ? { status: memberStatus } : {}), ...(membershipStatus ? { membership: membershipStatus } : {}), page: String(totalPages) });
    redirect(`/gym/members?${query.toString()}`);
  }


 return (
  <MemberDirectory
    rows={rows}
    count={count}
    page={page}
    totalPages={totalPages}
    q={q}
    memberStatus={memberStatus}
    membershipStatus={membershipStatus}
    plans={(plansData || []) as {
      id: string;
      name: string;
      duration_days: number;
    }[]}
    plansError={Boolean(plansError)}
  />
);
}
