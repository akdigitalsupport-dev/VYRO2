export const MEMBER_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const MEMBER_PHOTO_MIME_TYPES = ["image/jpeg", "image/png"] as const;

export type MemberPhotoMimeType = (typeof MEMBER_PHOTO_MIME_TYPES)[number];

export function memberPhotoInputError(file: Pick<File, "type" | "size"> | null): string | null {
  if (!file) return null;
  if (!MEMBER_PHOTO_MIME_TYPES.includes(file.type as MemberPhotoMimeType) || file.size <= 0 || file.size > MEMBER_PHOTO_MAX_BYTES) {
    return "Please upload a JPG, JPEG, or PNG image up to 5 MB.";
  }
  return null;
}

export async function validateMemberPhotoFile(file: File | null): Promise<string | null> {
  const inputError = memberPhotoInputError(file);
  if (inputError || !file) return inputError;

  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPng = file.type === "image/png"
    && signature.length >= 8
    && signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47
    && signature[4] === 0x0d && signature[5] === 0x0a && signature[6] === 0x1a && signature[7] === 0x0a;
  const isJpeg = file.type === "image/jpeg"
    && signature.length >= 3
    && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;

  return isPng || isJpeg ? null : "Please upload a JPG, JPEG, or PNG image up to 5 MB.";
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createMemberPhotoStoragePath(
  gymId: string,
  memberId: string,
  mimeType: MemberPhotoMimeType,
  objectId: string,
) {
  if (!uuidPattern.test(gymId) || !uuidPattern.test(memberId) || !uuidPattern.test(objectId)) {
    throw new Error("Invalid member photo path identity.");
  }
  const extension = mimeType === "image/png" ? "png" : "jpg";
  return `gyms/${gymId}/members/${memberId}/photo-${objectId}.${extension}`;
}
