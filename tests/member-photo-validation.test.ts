import { describe, expect, it } from "vitest";
import { createMemberPhotoStoragePath, MEMBER_PHOTO_MAX_BYTES, memberPhotoInputError, validateMemberPhotoFile } from "@/lib/validation/member-photo";
import { editMemberSchema } from "@/lib/validation/members";

const gymId = "08618fc1-eeba-4ca9-b801-36b3de5b2b6d";
const memberId = "e4d63723-afce-4ec0-bac0-bc98f07555d5";
const objectId = "2b8e26f7-33cd-44c0-8934-0e2b23017e99";

describe("member photo validation", () => {
  it("accepts JPEG/JPG content with the JPEG MIME type", async () => {
    const content = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const jpg = new File([content], "photo.jpg", { type: "image/jpeg" });
    const jpeg = new File([content], "photo.jpeg", { type: "image/jpeg" });
    expect(memberPhotoInputError(jpg)).toBeNull();
    expect(await validateMemberPhotoFile(jpg)).toBeNull();
    expect(await validateMemberPhotoFile(jpeg)).toBeNull();
  });

  it("accepts PNG content", async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "photo.png", { type: "image/png" });
    expect(await validateMemberPhotoFile(file)).toBeNull();
  });

  it("rejects unsupported MIME types and content that does not match its declared MIME type", async () => {
    const pdf = new File(["%PDF-1.7"], "photo.pdf", { type: "application/pdf" });
    const disguised = new File(["not an image"], "photo.jpg", { type: "image/jpeg" });
    expect(memberPhotoInputError(pdf)).toContain("JPG, JPEG, or PNG");
    expect(await validateMemberPhotoFile(disguised)).toContain("JPG, JPEG, or PNG");
  });

  it("rejects photos larger than 5 MB", async () => {
    const file = new File([new Uint8Array(MEMBER_PHOTO_MAX_BYTES + 1)], "large.png", { type: "image/png" });
    expect(memberPhotoInputError(file)).toContain("up to 5 MB");
    expect(await validateMemberPhotoFile(file)).toContain("up to 5 MB");
  });

  it("allows an omitted photo because photos are optional", async () => {
    expect(memberPhotoInputError(null)).toBeNull();
    expect(await validateMemberPhotoFile(null)).toBeNull();
  });
});

describe("member photo storage paths", () => {
  it("builds a collision-safe path from server identities and the validated image type", () => {
    expect(createMemberPhotoStoragePath(gymId, memberId, "image/jpeg", objectId))
      .toBe(`gyms/${gymId}/members/${memberId}/photo-${objectId}.jpg`);
    expect(createMemberPhotoStoragePath(gymId, memberId, "image/png", objectId))
      .toBe(`gyms/${gymId}/members/${memberId}/photo-${objectId}.png`);
  });

  it("rejects path components that are not UUIDs", () => {
    expect(() => createMemberPhotoStoragePath("../other-gym", memberId, "image/jpeg", objectId)).toThrow();
    expect(() => createMemberPhotoStoragePath(gymId, "../../other-member", "image/jpeg", objectId)).toThrow();
  });

  it("keeps existing member validation unchanged and permits its existing fields", () => {
    expect(editMemberSchema.safeParse({
      full_name: "Ankush Kumar", phone: "", email: "", gender: "", date_of_birth: "",
      address: "", notes: "",
    }).success).toBe(true);
  });
});
