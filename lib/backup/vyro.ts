import { createHash, timingSafeEqual } from "node:crypto";

export const VYRO_BACKUP_MAGIC = "VYRO_BACKUP_V1\n";
export const MAX_VYRO_BACKUP_BYTES = 100 * 1024 * 1024;

export type BackupCounts = {
  members: number;
  plans: number;
  memberships: number;
  payments: number;
  attendance: number;
  trainers: number;
  expenses: number;
  photos: number;
};

export type BackupAsset = {
  kind: "member_photo" | "gym_logo";
  owner_id: string;
  path: string;
  mime_type: "image/jpeg" | "image/png";
  sha256: string;
  content_base64: string;
};

export type VyroBackupPayload = {
  manifest: {
    format: "VYRO";
    version: 1;
    created_at: string;
    gym_id: string;
    gym_name: string;
    counts: BackupCounts;
  };
  data: {
    gym: Record<string, unknown>;
    settings: Record<string, unknown>;
    members: Record<string, unknown>[];
    plans: Record<string, unknown>[];
    memberships: Record<string, unknown>[];
    payments: Record<string, unknown>[];
    attendance: Record<string, unknown>[];
    trainers: Record<string, unknown>[];
    expenses: Record<string, unknown>[];
    notification_preferences: Record<string, unknown>[];
  };
  assets: BackupAsset[];
};

export type ParsedVyroBackup = { payload: VyroBackupPayload; counts: BackupCounts };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digestPattern = /^[0-9a-f]{64}$/i;
const mimeExtensions = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"] } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Backup ${label} is invalid.`);
  return value;
}

function requireArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > 100_000 || !value.every(isRecord)) {
    throw new Error(`Backup ${label} is invalid.`);
  }
  return value;
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function digestMatches(value: string | Uint8Array, expected: string) {
  if (!digestPattern.test(expected)) return false;
  return timingSafeEqual(Buffer.from(sha256(value), "hex"), Buffer.from(expected, "hex"));
}

function ensureUniqueIds(rows: Record<string, unknown>[], label: string) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (typeof row.id !== "string" || !uuid.test(row.id) || ids.has(row.id)) {
      throw new Error(`Backup ${label} contain a missing, invalid, or duplicate ID.`);
    }
    ids.add(row.id);
  }
  return ids;
}

function requireGymOwnership(rows: Record<string, unknown>[], gymId: string, label: string) {
  for (const row of rows) {
    if (row.gym_id !== gymId) throw new Error(`Backup ${label} include a different gym.`);
  }
}

function validatePayload(value: unknown, expectedGymId: string): ParsedVyroBackup {
  const root = requireRecord(value, "payload");
  const manifest = requireRecord(root.manifest, "manifest");
  const data = requireRecord(root.data, "data");
  if (manifest.format !== "VYRO" || manifest.version !== 1) throw new Error("This VYRO backup version is not supported.");
  if (typeof manifest.gym_id !== "string" || !uuid.test(manifest.gym_id) || manifest.gym_id !== expectedGymId) {
    throw new Error("This backup belongs to a different gym.");
  }
  if (typeof manifest.created_at !== "string" || Number.isNaN(Date.parse(manifest.created_at))) throw new Error("Backup creation date is invalid.");
  if (typeof manifest.gym_name !== "string" || manifest.gym_name.trim().length === 0) throw new Error("Backup gym details are invalid.");

  const gym = requireRecord(data.gym, "gym settings");
  const settings = requireRecord(data.settings, "gym settings");
  if (gym.id !== expectedGymId || settings.gym_id !== expectedGymId) throw new Error("Backup gym details do not match its manifest.");

  const rows = {
    members: requireArray(data.members, "members"),
    plans: requireArray(data.plans, "plans"),
    memberships: requireArray(data.memberships, "membership history"),
    payments: requireArray(data.payments, "payments"),
    attendance: requireArray(data.attendance, "attendance"),
    trainers: requireArray(data.trainers, "trainers"),
    expenses: requireArray(data.expenses, "expenses"),
    notification_preferences: requireArray(data.notification_preferences, "notification settings"),
  };
  const counts: BackupCounts = {
    members: rows.members.length,
    plans: rows.plans.length,
    memberships: rows.memberships.length,
    payments: rows.payments.length,
    attendance: rows.attendance.length,
    trainers: rows.trainers.length,
    expenses: rows.expenses.length,
    photos: 0,
  };
  const ids = {
    members: ensureUniqueIds(rows.members, "members"),
    plans: ensureUniqueIds(rows.plans, "plans"),
    memberships: ensureUniqueIds(rows.memberships, "memberships"),
    payments: ensureUniqueIds(rows.payments, "payments"),
    attendance: ensureUniqueIds(rows.attendance, "attendance records"),
    trainers: ensureUniqueIds(rows.trainers, "trainers"),
    expenses: ensureUniqueIds(rows.expenses, "expenses"),
  };
  for (const [name, list] of Object.entries(rows)) {
    if (name !== "notification_preferences") requireGymOwnership(list, expectedGymId, name);
  }

  for (const member of rows.members) {
    if (member.status === "archived" || member.archived_at !== null) throw new Error("Archived members cannot be included in a normal VYRO backup.");
  }
  for (const membership of rows.memberships) {
    if (typeof membership.member_id !== "string" || !ids.members.has(membership.member_id)) throw new Error("Backup membership history references a missing member.");
    if (typeof membership.membership_plan_id !== "string" || !ids.plans.has(membership.membership_plan_id)) throw new Error("Backup membership history references a missing plan.");
  }
  for (const payment of rows.payments) {
    if (typeof payment.member_id !== "string" || !ids.members.has(payment.member_id)) throw new Error("Backup payments reference a missing member.");
    if (payment.membership_id !== null && payment.membership_id !== undefined &&
      (typeof payment.membership_id !== "string" || !ids.memberships.has(payment.membership_id))) {
      throw new Error("Backup payments reference a missing membership.");
    }
  }
  for (const attendance of rows.attendance) {
    if (typeof attendance.member_id !== "string" || !ids.members.has(attendance.member_id)) throw new Error("Backup attendance references a missing member.");
  }

  if (!Array.isArray(root.assets) || root.assets.length > rows.members.length + 1) throw new Error("Backup photos are invalid.");
  const assets: BackupAsset[] = [];
  const seenAssets = new Set<string>();
  const memberPhotoPaths = new Set<string>();
  const memberPhotoOwners = new Set<string>();
  const gymIdEscaped = expectedGymId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const memberPathPattern = new RegExp(`^gyms/${gymIdEscaped}/members/([0-9a-f-]{36})/photo-[0-9a-f-]{36}\\.(jpg|jpeg|png)$`, "i");
  const logoPathPattern = new RegExp(`^${gymIdEscaped}/logo/logo-[0-9a-f-]{36}\\.(jpg|jpeg|png)$`, "i");
  for (const rawAsset of root.assets) {
    const asset = requireRecord(rawAsset, "photo");
    if (asset.kind !== "member_photo" && asset.kind !== "gym_logo") throw new Error("Backup contains an unsupported photo type.");
    if (typeof asset.owner_id !== "string" || !uuid.test(asset.owner_id) || typeof asset.path !== "string" ||
      typeof asset.mime_type !== "string" || !(asset.mime_type in mimeExtensions) || typeof asset.sha256 !== "string" ||
      typeof asset.content_base64 !== "string" || !digestPattern.test(asset.sha256)) throw new Error("Backup photo metadata is invalid.");
    const key = `${asset.kind}:${asset.owner_id}`;
    if (seenAssets.has(key)) throw new Error("Backup contains duplicate photos.");
    seenAssets.add(key);
    const pathMatch = asset.kind === "member_photo" ? memberPathPattern.exec(asset.path) : logoPathPattern.exec(asset.path);
    if (!pathMatch || (asset.kind === "member_photo" && (pathMatch[1].toLowerCase() !== asset.owner_id.toLowerCase() || !ids.members.has(asset.owner_id))) ||
      (asset.kind === "gym_logo" && asset.owner_id !== expectedGymId)) throw new Error("Backup photo path does not match its gym or owner.");
    const extension = pathMatch[2].toLowerCase();
    if (!mimeExtensions[asset.mime_type as keyof typeof mimeExtensions].includes(extension as never)) throw new Error("Backup photo type does not match its file name.");
    const bytes = Buffer.from(asset.content_base64, "base64");
    const assetLimit = asset.kind === "gym_logo" ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    if (bytes.length === 0 || bytes.length > assetLimit || bytes.toString("base64") !== asset.content_base64 || !digestMatches(bytes, asset.sha256)) {
      throw new Error("A backup photo is corrupt or exceeds the 5 MB limit.");
    }
    const isJpeg = asset.mime_type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = asset.mime_type === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (!isJpeg && !isPng) throw new Error("A backup photo does not match its declared image type.");
    assets.push(asset as BackupAsset);
    if (asset.kind === "member_photo") {
      memberPhotoPaths.add(asset.path);
      memberPhotoOwners.add(asset.owner_id);
    }
  }
  for (const member of rows.members) {
    const photoPath = member.photo_path;
    if (photoPath !== null && photoPath !== undefined && (typeof photoPath !== "string" || !memberPhotoPaths.has(photoPath))) {
      throw new Error("A member photo is missing from the backup.");
    }
    if ((photoPath === null || photoPath === undefined) && memberPhotoOwners.has(String(member.id))) {
      throw new Error("Backup contains an unreferenced member photo.");
    }
  }
  if ((gym.logo_path === null || gym.logo_path === undefined) !== !assets.some((asset) => asset.kind === "gym_logo")) {
    throw new Error("The gym logo is missing or unreferenced.");
  }
  counts.photos = assets.length;

  const declaredCounts = requireRecord(manifest.counts, "record counts");
  for (const [key, count] of Object.entries(counts)) {
    if (declaredCounts[key] !== count) throw new Error("Backup record counts do not match its contents.");
  }

  return {
    payload: {
      manifest: manifest as VyroBackupPayload["manifest"],
      data: { ...data, ...rows, gym, settings } as VyroBackupPayload["data"],
      assets,
    },
    counts,
  };
}

export function createVyroBackupFile(payload: VyroBackupPayload) {
  const serializedPayload = JSON.stringify(payload);
  const envelope = JSON.stringify({ payload, sha256: sha256(serializedPayload) });
  const result = Buffer.from(VYRO_BACKUP_MAGIC + envelope, "utf8");
  if (result.byteLength > MAX_VYRO_BACKUP_BYTES) throw new Error("The backup is larger than the 100 MB download limit.");
  return result;
}

export function parseVyroBackupFile(bytes: Uint8Array, expectedGymId: string): ParsedVyroBackup {
  if (bytes.byteLength > MAX_VYRO_BACKUP_BYTES || bytes.byteLength < VYRO_BACKUP_MAGIC.length + 2) throw new Error("Choose a valid VYRO backup up to 100 MB.");
  const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!content.startsWith(VYRO_BACKUP_MAGIC)) throw new Error("This file is not a VYRO backup.");
  let envelope: unknown;
  try {
    envelope = JSON.parse(content.slice(VYRO_BACKUP_MAGIC.length));
  } catch {
    throw new Error("Backup file is damaged or incomplete.");
  }
  const root = requireRecord(envelope, "integrity envelope");
  const payload = requireRecord(root.payload, "payload");
  const digest = root.sha256;
  if (typeof digest !== "string" || !digestMatches(JSON.stringify(payload), digest)) throw new Error("Backup integrity check failed. The file may have changed or been damaged.");
  return validatePayload(payload, expectedGymId);
}
