import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function csvCell(value: string) {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export async function GET() {
  await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const { data: summary, error: summaryError } = await supabase.rpc("get_gym_checkin_code_summary");
  const counts = Array.isArray(summary) ? summary[0] : null;
  if (summaryError || !counts || Number(counts.active_members) !== Number(counts.assigned_codes)) {
    return Response.json({ error: "Generate an ID for every active member before downloading the list." }, { status: 409 });
  }
  const rows: Array<{ full_name: string; check_in_code: string }> = [];

  for (let offset = 0; offset <= 10000; offset += 500) {
    const { data, error } = await supabase.rpc("get_gym_checkin_codes", {
      p_page_size: 500,
      p_page_offset: offset,
    });
    if (error) {
      console.error("Gym check-in code export failed", { code: error.code });
      return Response.json({ error: "Member IDs could not be downloaded." }, { status: 500 });
    }
    const batch = (data ?? []) as Array<{ full_name: string; check_in_code: string }>;
    rows.push(...batch);
    if (batch.length < 500) break;
  }

  const csv = ["Member name,4-digit Member ID", ...rows.map((row) => `${csvCell(row.full_name)},${csvCell(row.check_in_code)}`)].join("\r\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vyro-member-check-in-ids.csv"',
      "Cache-Control": "private, no-store",
      "Vary": "Cookie",
    },
  });
}
