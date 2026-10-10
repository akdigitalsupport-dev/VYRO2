import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createVyroBackupFile, parseVyroBackupFile, type VyroBackupPayload } from "@/lib/backup/vyro";

const gymId = "e4d63723-afce-4ec0-bac0-bc98f07555d5";
const memberId = "540e2568-cf64-45f7-9476-667bbd8241e2";
const planId = "d3f1baba-c047-49c3-8712-f818dad639f6";
const membershipId = "efae10cb-ed56-4421-b9c3-9dbe961d9c57";
const paymentId = "324f3144-cf59-4d51-b90b-24da954e7cdd";

function payload(): VyroBackupPayload {
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  return {
    manifest: {
      format: "VYRO", version: 1, created_at: "2026-10-08T12:00:00.000Z", gym_id: gymId, gym_name: "Preview Gym",
      counts: { members: 1, plans: 1, memberships: 1, payments: 1, attendance: 0, trainers: 0, expenses: 0, photos: 1 },
    },
    data: {
      gym: { id: gymId, name: "Preview Gym", logo_path: null, branding: {} },
      settings: { gym_id: gymId, timezone: "Asia/Kolkata", currency: "INR", preferences: {} },
      members: [{ id: memberId, gym_id: gymId, member_code: "VY-001", status: "active", archived_at: null, photo_path: `gyms/${gymId}/members/${memberId}/photo-efae10cb-ed56-4421-b9c3-9dbe961d9c57.jpg` }],
      plans: [{ id: planId, gym_id: gymId, name: "Monthly", duration_days: 30, price: "599.00", is_active: true }],
      memberships: [{ id: membershipId, gym_id: gymId, member_id: memberId, membership_plan_id: planId }],
      payments: [{ id: paymentId, gym_id: gymId, member_id: memberId, membership_id: membershipId, status: "completed" }],
      attendance: [], trainers: [], expenses: [], notification_preferences: [],
    },
    assets: [{
      kind: "member_photo", owner_id: memberId,
      path: `gyms/${gymId}/members/${memberId}/photo-efae10cb-ed56-4421-b9c3-9dbe961d9c57.jpg`,
      mime_type: "image/jpeg", sha256: createHash("sha256").update(image).digest("hex"), content_base64: image.toString("base64"),
    }],
  };
}

describe("VYRO backup file validation", () => {
  it("creates and verifies a single tenant-scoped backup with integrity counts", () => {
    const parsed = parseVyroBackupFile(createVyroBackupFile(payload()), gymId);
    expect(parsed.counts).toEqual({ members: 1, plans: 1, memberships: 1, payments: 1, attendance: 0, trainers: 0, expenses: 0, photos: 1 });
    expect(parsed.payload.data.members[0].id).toBe(memberId);
  });

  it("rejects modified content and a different gym", () => {
    const backup = createVyroBackupFile(payload());
    const tampered = Buffer.from(backup);
    tampered[tampered.length - 4] ^= 1;
    expect(() => parseVyroBackupFile(tampered, gymId)).toThrow(/integrity/i);
    expect(() => parseVyroBackupFile(backup, "08618fc1-eeba-4ca9-b801-36b3de5b2b6d")).toThrow(/different gym/i);
  });

  it("rejects archived members and broken membership/payment references", () => {
    const archived = payload();
    archived.data.members[0].archived_at = "2026-10-08T00:00:00Z";
    expect(() => parseVyroBackupFile(createVyroBackupFile(archived), gymId)).toThrow(/archived/i);

    const broken = payload();
    broken.data.payments[0].membership_id = "860e2568-cf64-45f7-9476-667bbd8241e2";
    expect(() => parseVyroBackupFile(createVyroBackupFile(broken), gymId)).toThrow(/missing membership/i);
  });

  it("rejects a photo whose digest or owner path does not match", () => {
    const wrongHash = payload();
    wrongHash.assets[0].sha256 = "0".repeat(64);
    expect(() => parseVyroBackupFile(createVyroBackupFile(wrongHash), gymId)).toThrow(/corrupt/i);

    const wrongPath = payload();
    wrongPath.assets[0].path = `gyms/${gymId}/members/${planId}/photo-efae10cb-ed56-4421-b9c3-9dbe961d9c57.jpg`;
    expect(() => parseVyroBackupFile(createVyroBackupFile(wrongPath), gymId)).toThrow(/path/i);
  });
});
