import { randomUUID } from "node:crypto";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createMemberPhotoStoragePath, type MemberPhotoMimeType } from "@/lib/validation/member-photo";
import { MAX_VYRO_BACKUP_BYTES, parseVyroBackupFile, type BackupAsset } from "@/lib/backup/vyro";

const memberPhotoBucket = "vyro-member-photos";
const logoBucket = "vyro-gym-logos";

async function readLimitedBody(request: Request) {
  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  if (declaredSize > MAX_VYRO_BACKUP_BYTES) throw new Error("Choose a VYRO backup up to 100 MB.");
  if (!request.body) throw new Error("Choose a VYRO backup file.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_VYRO_BACKUP_BYTES) {
      await reader.cancel();
      throw new Error("Choose a VYRO backup up to 100 MB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function restoredAssetPath(gymId: string, asset: BackupAsset) {
  if (asset.kind === "member_photo") {
    return createMemberPhotoStoragePath(gymId, asset.owner_id, asset.mime_type as MemberPhotoMimeType, randomUUID());
  }
  const extension = asset.mime_type === "image/png" ? "png" : "jpg";
  return `${gymId}/logo/logo-${randomUUID()}.${extension}`;
}

async function cleanupUploaded(admin: ReturnType<typeof createAdminSupabaseClient>, uploaded: Array<{ bucket: string; path: string }>) {
  let complete = true;
  for (const bucketName of [memberPhotoBucket, logoBucket]) {
    const paths = uploaded.filter((item) => item.bucket === bucketName).map((item) => item.path);
    if (paths.length === 0) continue;
    const { error } = await admin.storage.from(bucketName).remove(paths);
    if (error) complete = false;
  }
  return complete;
}

export async function POST(request: Request) {
  const { gymId } = await requireGymAdminContext();
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/vnd.vyro.backup")) {
    return Response.json({ error: "Upload a .vyro backup file." }, { status: 415 });
  }

  let bytes: Uint8Array;
  let parsed: ReturnType<typeof parseVyroBackupFile>;
  try {
    bytes = await readLimitedBody(request);
    parsed = parseVyroBackupFile(bytes, gymId);
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Backup file could not be read." }, { status: 400 });
  }

  if (new URL(request.url).searchParams.get("preview") === "1") {
    return Response.json({ gym: parsed.payload.manifest.gym_name, createdAt: parsed.payload.manifest.created_at, counts: parsed.counts });
  }

  const supabase = await createServerSupabaseClient();
  const admin = createAdminSupabaseClient();
  const uploaded: Array<{ bucket: string; path: string }> = [];
  const memberPaths = new Map<string, string>();
  let logoPath: string | null = null;
  for (const asset of parsed.payload.assets) {
    const path = restoredAssetPath(gymId, asset);
    const bucket = asset.kind === "member_photo" ? memberPhotoBucket : logoBucket;
    const body = new Blob([Buffer.from(asset.content_base64, "base64")], { type: asset.mime_type });
    const { error } = await admin.storage.from(bucket).upload(path, body, {
      contentType: asset.mime_type,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      const cleanupComplete = await cleanupUploaded(admin, uploaded);
      return Response.json({ error: cleanupComplete
        ? "A private photo could not be restored. No database records were changed."
        : "A private photo could not be restored. No database records were changed, but a temporary photo could not be removed; contact support." }, { status: 500 });
    }
    uploaded.push({ bucket, path });
    if (asset.kind === "member_photo") memberPaths.set(asset.owner_id, path);
    else logoPath = path;
  }

  const data = {
    ...parsed.payload.data,
    gym: { ...parsed.payload.data.gym, logo_path: logoPath },
    members: parsed.payload.data.members.map((member) => ({
      ...member,
      photo_path: memberPaths.get(String(member.id)) ?? null,
    })),
  };
  const { data: restored, error } = await supabase.rpc("restore_gym_operational_backup", {
    p_backup: { manifest: parsed.payload.manifest, data },
  });
  if (error) {
    const cleanupComplete = await cleanupUploaded(admin, uploaded);
    console.error("VYRO backup restore transaction failed", { code: error.code });
    const status = error.code === "23505" ? 409 : error.code === "42501" ? 403 : 400;
    return Response.json({ error: error.code === "23505"
      ? "This backup contains records that already exist. No records were restored."
      : cleanupComplete
        ? "Backup data could not be restored. No database records were changed."
        : "Backup data could not be restored. No database records were changed, but a temporary photo could not be removed; contact support." }, { status });
  }

  return Response.json({ success: true, restored, photos: uploaded.length });
}
