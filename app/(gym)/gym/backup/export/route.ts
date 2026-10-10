import { createHash } from "node:crypto";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createVyroBackupFile, type BackupAsset, type BackupCounts, type VyroBackupPayload } from "@/lib/backup/vyro";

type Row = Record<string, unknown>;
type PageFilter = { column: string; value: string };
const memberPhotoBucket = "vyro-member-photos";
const logoBucket = "vyro-gym-logos";

async function fetchRows(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  table: string,
  gymId: string,
  order: string,
  filters: PageFilter[] = [],
) {
  const all: Row[] = [];
  for (let offset = 0; offset < 100_000; offset += 1000) {
    let query = supabase.from(table as never).select("*").eq("gym_id", gymId).order(order, { ascending: true });
    for (const filter of filters) query = query.eq(filter.column, filter.value);
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw new Error(`Could not read ${table} for backup.`);
    const rows = (data ?? []) as unknown as Row[];
    all.push(...rows);
    if (rows.length < 1000) return all;
  }
  throw new Error(`The ${table} backup exceeds the supported record limit.`);
}

async function fetchMemberChildren(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  table: string,
  memberIds: string[],
  order: string,
) {
  if (memberIds.length === 0) return [];
  const all: Row[] = [];
  for (let start = 0; start < memberIds.length; start += 100) {
    const batch = memberIds.slice(start, start + 100);
    const { data, error } = await supabase.from(table as never).select("*").in("member_id", batch).order(order, { ascending: true });
    if (error) throw new Error(`Could not read ${table} for backup.`);
    all.push(...((data ?? []) as unknown as Row[]));
  }
  return all;
}

function rowId(row: Row, label: string) {
  if (typeof row.id !== "string") throw new Error(`A ${label} row has no ID.`);
  return row.id;
}

async function backupAsset(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  kind: BackupAsset["kind"],
  ownerId: string,
  path: string,
): Promise<BackupAsset> {
  const bucket = kind === "member_photo" ? memberPhotoBucket : logoBucket;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error("A private gym photo could not be included in the backup.");
  if (data.size > 5 * 1024 * 1024) throw new Error("A gym photo exceeds the 5 MB backup limit.");
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const mimeType = data.type === "image/jpeg" || data.type === "image/png"
    ? data.type
    : extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : extension === "png"
        ? "image/png"
        : null;
  if (!mimeType) throw new Error("A gym photo has an unsupported image type.");
  const bytes = Buffer.from(await data.arrayBuffer());
  const extensionMatches = mimeType === "image/png" ? extension === "png" : extension === "jpg" || extension === "jpeg";
  const signatureMatches = mimeType === "image/png"
    ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!extensionMatches || !signatureMatches) throw new Error("A gym photo has an invalid or mismatched image type.");
  return {
    kind,
    owner_id: ownerId,
    path,
    mime_type: mimeType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    content_base64: bytes.toString("base64"),
  };
}

export async function GET() {
  const { user, gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  try {
    const [{ data: gym, error: gymError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase.from("gyms").select("*").eq("id", gymId).maybeSingle(),
      supabase.from("gym_settings").select("*").eq("gym_id", gymId).maybeSingle(),
    ]);
    if (gymError || settingsError || !gym || !settings) throw new Error("Gym settings could not be verified for backup.");

    const [members, plans, trainers, expenses, notificationPreferences] = await Promise.all([
      fetchRows(supabase, "members", gymId, "created_at"),
      fetchRows(supabase, "membership_plans", gymId, "created_at"),
      fetchRows(supabase, "trainers", gymId, "created_at"),
      fetchRows(supabase, "gym_expenses", gymId, "expense_date"),
      supabase.from("notification_preferences").select("*").eq("gym_id", gymId).eq("user_id", user.id).then(({ data, error }) => {
        if (error) throw new Error("Notification settings could not be included in the backup.");
        return data ?? [];
      }),
    ]);
    const includedMembers = members.filter((member) => member.status !== "archived" && member.archived_at == null);
    const memberIds = includedMembers.map((member) => rowId(member, "member"));
    const memberSet = new Set(memberIds);
    const includedPlans = plans;
    const planSet = new Set(includedPlans.map((plan) => rowId(plan, "plan")));
    const [allMemberships, allPayments, allAttendance] = await Promise.all([
      fetchMemberChildren(supabase, "member_memberships", memberIds, "start_date"),
      fetchMemberChildren(supabase, "member_payments", memberIds, "payment_date"),
      fetchMemberChildren(supabase, "attendance_records", memberIds, "checked_in_at"),
    ]);
    const memberships = allMemberships.filter((row) => row.gym_id === gymId && memberSet.has(String(row.member_id)) && planSet.has(String(row.membership_plan_id)));
    const membershipIds = new Set(memberships.map((row) => String(row.id)));
    const payments = allPayments.filter((row) => row.gym_id === gymId && memberSet.has(String(row.member_id)) &&
      (row.status === "completed" || row.status === "refunded") &&
      (row.membership_id == null || membershipIds.has(String(row.membership_id))));
    const attendance = allAttendance.filter((row) => row.gym_id === gymId && memberSet.has(String(row.member_id)));
    const operationalTrainers = trainers.filter((row) => row.archived_at == null);
    const operationalExpenses = expenses.filter((row) => row.archived_at == null);

    const assets: BackupAsset[] = [];
    for (const member of includedMembers) {
      if (typeof member.photo_path === "string") assets.push(await backupAsset(supabase, "member_photo", rowId(member, "member"), member.photo_path));
    }
    if (typeof gym.logo_path === "string") assets.push(await backupAsset(supabase, "gym_logo", gymId, gym.logo_path));

    const counts: BackupCounts = {
      members: includedMembers.length,
      plans: includedPlans.length,
      memberships: memberships.length,
      payments: payments.length,
      attendance: attendance.length,
      trainers: operationalTrainers.length,
      expenses: operationalExpenses.length,
      photos: assets.length,
    };
    const payload: VyroBackupPayload = {
      manifest: { format: "VYRO", version: 1, created_at: new Date().toISOString(), gym_id: gymId, gym_name: String(gym.name), counts },
      data: {
        gym: gym as unknown as Row,
        settings: settings as unknown as Row,
        members: includedMembers,
        plans: includedPlans,
        memberships,
        payments,
        attendance,
        trainers: operationalTrainers,
        expenses: operationalExpenses,
        notification_preferences: notificationPreferences as unknown as Row[],
      },
      assets,
    };
    const bytes = createVyroBackupFile(payload);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: String(settings.timezone ?? "Asia/Kolkata"), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/vnd.vyro.backup",
        "Content-Disposition": `attachment; filename="VYRO_Backup_${day}.vyro"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (cause) {
    console.error("VYRO backup export failed", { message: cause instanceof Error ? cause.message : "unknown error" });
    return Response.json({ error: cause instanceof Error ? cause.message : "Backup could not be created." }, { status: 500 });
  }
}
