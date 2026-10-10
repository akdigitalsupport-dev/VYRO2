"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireGymAdminContext } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createMemberPhotoStoragePath, validateMemberPhotoFile, type MemberPhotoMimeType } from "@/lib/validation/member-photo";
import { dateInTimeZone, memberPaymentDetailsSchema, membershipPaymentAmountSchema, parseMembershipPlanPrice } from "@/lib/validation/member-finance";
import { formatInr } from "@/lib/money";
import { createMemberSchema, editMemberSchema } from "@/lib/validation/members";

const memberPhotoBucket = "vyro-member-photos";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

function fieldErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

function photoFile(formData: FormData) {
  for (const key of ["photo", "camera_photo"]) {
    const candidate = formData.get(key);
    if (candidate instanceof File && candidate.size > 0) return candidate;
  }
  return null;
}

function isMemberId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type PhotoMutationResult = { ok: true; message: string } | { ok: false; message: string };

async function mutateMemberPhoto(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  gymId: string,
  memberId: string,
  file: File | null,
  remove: boolean,
): Promise<PhotoMutationResult> {
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("photo_path")
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .maybeSingle();
  if (memberError || !member) return { ok: false, message: "The member could not be found in this gym." };

  const oldPath = member.photo_path;
  if (!file && !remove) return { ok: true, message: "No photo changes were made." };

  let newPath: string | null = null;
  if (file) {
    const validationError = await validateMemberPhotoFile(file);
    if (validationError) return { ok: false, message: validationError };
    const mimeType = file.type as MemberPhotoMimeType;
    newPath = createMemberPhotoStoragePath(gymId, memberId, mimeType, randomUUID());
    const { error: uploadError } = await supabase.storage.from(memberPhotoBucket).upload(newPath, file, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      console.error("Member photo Storage upload failed", {
        bucket: memberPhotoBucket,
        path: newPath,
        contentType: mimeType,
        size: file.size,
        response: uploadError.toJSON(),
      });
      await supabase.storage.from(memberPhotoBucket).remove([newPath]);
      return { ok: false, message: "The photo could not be uploaded. Check the file and try again." };
    }
  }

  const nextPath = newPath;
  const { data: updated, error: updateError } = await supabase
    .from("members")
    .update({ photo_path: nextPath })
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    if (newPath) await supabase.storage.from(memberPhotoBucket).remove([newPath]);
    return { ok: false, message: "The photo was stored but could not be attached to this member. Please try again." };
  }

  if (oldPath && oldPath !== newPath) {
    const { error: cleanupError } = await supabase.storage.from(memberPhotoBucket).remove([oldPath]);
    if (cleanupError) {
      return {
        ok: true,
        message: remove
          ? "The photo was removed from the member profile, but the old storage file could not be cleaned up."
          : "The new photo is saved, but the previous storage file could not be cleaned up.",
      };
    }
  }

  return { ok: true, message: remove ? "Member photo removed." : "Member photo saved." };
}

export async function createMemberAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { gymId } = await requireGymAdminContext();
  const selectedPhoto = photoFile(formData);
  const photoValidationError = await validateMemberPhotoFile(selectedPhoto);
  if (photoValidationError) return { status: "error", message: photoValidationError };

  const parsed = createMemberSchema.safeParse({
    full_name: value(formData, "full_name"),
    phone: value(formData, "phone"),
    email: value(formData, "email"),
    gender: value(formData, "gender") === "not_specified" ? "" : value(formData, "gender"),
    date_of_birth: value(formData, "date_of_birth"),
    address: value(formData, "address"),
    joining_date: value(formData, "joining_date"),
    notes: value(formData, "notes"),
    membership_plan_id: value(formData, "membership_plan_id"),
    membership_start_date: value(formData, "membership_start_date"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Review the highlighted fields and try again.", fieldErrors: fieldErrors(parsed.error) };
  }

  const member = parsed.data;
  const supabase = await createServerSupabaseClient();
  const [{ data: plan, error: planError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase
      .from("membership_plans")
      .select("id, price")
      .eq("id", member.membership_plan_id)
      .eq("gym_id", gymId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase.from("gym_settings").select("timezone, currency, registration_fee_amount, registration_fee_enabled").eq("gym_id", gymId).maybeSingle(),
  ]);
  if (planError || !plan) return { status: "error", message: "That active plan is unavailable in this gym. Refresh and choose another plan." };
  if (settingsError) return { status: "error", message: "Gym payment settings could not be verified. Refresh and try again." };
  const registrationFeeEnabled = settings?.registration_fee_enabled ?? true;
  const chargeRegistration = registrationFeeEnabled && value(formData, "charge_registration") === "on";
  let registrationDetails: ReturnType<typeof memberPaymentDetailsSchema.safeParse> | null = null;
  if (chargeRegistration) {
    registrationDetails = memberPaymentDetailsSchema.safeParse({
      payment_date: value(formData, "registration_payment_date"),
      payment_method: value(formData, "registration_payment_method"),
      reference: value(formData, "registration_reference"),
      notes: value(formData, "registration_notes"),
    });
    if (!registrationDetails.success) {
      const registrationFieldErrors = Object.fromEntries(registrationDetails.error.issues.map((issue) => {
        const field = String(issue.path[0]);
        return [`registration_${field === "payment_date" ? "payment_date" : field === "payment_method" ? "payment_method" : field === "reference" ? "reference" : "notes"}`, issue.message];
      }));
      return { status: "error", message: "Review the registration payment details and try again.", fieldErrors: registrationFieldErrors };
    }
    if (registrationDetails.data.payment_date > dateInTimeZone(new Date(), settings?.timezone ?? "Asia/Kolkata")) {
      return { status: "error", message: "Registration payment date cannot be in the future.", fieldErrors: { registration_payment_date: "Choose today or an earlier date." } };
    }
  }

  const planPrice = parseMembershipPlanPrice(plan.price);
  if (planPrice === null) {
    return { status: "error", message: "The selected plan has an invalid saved price. Correct the plan before adding this member." };
  }
  const paymentAmountResult = membershipPaymentAmountSchema.safeParse(value(formData, "initial_payment_amount"));
  if (!paymentAmountResult.success) {
    return { status: "error", message: "Enter a valid payment amount, or enter 0 to pay later.", fieldErrors: { initial_payment_amount: paymentAmountResult.error.issues[0]?.message ?? "Enter a valid payment amount." } };
  }
  const paymentAmount = paymentAmountResult.data;
  if (paymentAmount > planPrice) {
    return { status: "error", message: `Payment exceeds the outstanding balance of ${formatInr(planPrice, { fractionDigits: 2 })}.`, fieldErrors: { initial_payment_amount: "Enter no more than the membership price." } };
  }
  const timeZone = settings?.timezone ?? "Asia/Kolkata";
  let paymentDetails: ReturnType<typeof memberPaymentDetailsSchema.safeParse> | null = null;
  if (paymentAmount > 0) {
    paymentDetails = memberPaymentDetailsSchema.safeParse({ payment_date: value(formData, "payment_date"), payment_method: value(formData, "payment_method"), reference: value(formData, "reference"), notes: value(formData, "payment_notes") });
    if (!paymentDetails.success) return { status: "error", message: "Review the initial payment details and try again.", fieldErrors: fieldErrors(paymentDetails.error) };
    if (paymentDetails.data.payment_date > dateInTimeZone(new Date(), timeZone)) return { status: "error", message: "Payment date cannot be in the future.", fieldErrors: { payment_date: "Choose today or an earlier date." } };
  }
  const { data: rows, error } = await supabase.rpc("create_gym_member_with_registration", {
    p_member_code: `VY-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`, p_full_name: member.full_name,
    p_phone: member.phone, p_email: member.email, p_gender: member.gender, p_date_of_birth: member.date_of_birth,
    p_address: member.address, p_joining_date: member.joining_date, p_member_notes: member.notes,
    p_membership_plan_id: member.membership_plan_id, p_membership_start_date: member.membership_start_date,
    p_initial_payment_amount: paymentAmount,
    p_payment_date: paymentDetails?.success ? paymentDetails.data.payment_date : null,
    p_payment_method: paymentDetails?.success ? paymentDetails.data.payment_method : null,
    p_reference: paymentDetails?.success ? paymentDetails.data.reference || null : null,
    p_payment_notes: paymentDetails?.success ? paymentDetails.data.notes || null : null,
    p_registration_payment_date: registrationDetails?.success ? registrationDetails.data.payment_date : null,
    p_registration_payment_method: registrationDetails?.success ? registrationDetails.data.payment_method : null,
    p_registration_reference: registrationDetails?.success ? registrationDetails.data.reference || null : null,
    p_registration_notes: registrationDetails?.success ? registrationDetails.data.notes || null : null,
    p_charge_registration: chargeRegistration,
  });
  const enrollment = Array.isArray(rows) ? rows[0] : null;
  if (error || !enrollment?.member_id || !enrollment?.membership_id || (paymentAmount > 0 && !enrollment.payment_id) || (chargeRegistration && !enrollment.registration_payment_id)) {
    console.error("Atomic member enrollment failed", { code: error?.code, message: error?.message });
    if (error?.message?.startsWith("PAYMENT_EXCEEDS_OUTSTANDING:")) {
      const dbOutstanding = Number(error.message.slice("PAYMENT_EXCEEDS_OUTSTANDING:".length));
      return { status: "error", message: `Payment exceeds the outstanding balance of ${formatInr(Number.isFinite(dbOutstanding) ? dbOutstanding : planPrice, { fractionDigits: 2 })}.`, fieldErrors: { initial_payment_amount: "Enter no more than the membership price." } };
    }
    return { status: "error", message: error?.code === "23P01" ? "Membership dates overlap existing history. Choose a different start date." : error?.code === "22023" ? "Review the member, membership, and payment dates and try again." : error?.code === "42501" ? "The selected plan is no longer available for this gym. Refresh and try again." : "The member, membership, payment, and registration could not be saved together. No partial enrollment was created." };
  }
  if (selectedPhoto) {
    const photoResult = await mutateMemberPhoto(supabase, gymId, enrollment.member_id, selectedPhoto, false);
    revalidatePath("/gym/members"); revalidatePath(`/gym/members/${enrollment.member_id}`);
    if (!photoResult.ok) return { status: "error", message: `Enrollment was saved, but the photo was not saved. ${photoResult.message}`, recordId: enrollment.member_id };
  }
  revalidatePath("/gym/members"); revalidatePath("/gym/members/billing"); revalidatePath("/gym/members/memberships"); revalidatePath("/gym/command-center");
  return { status: "success", message: chargeRegistration ? "Member, membership, and separate registration payment saved together." : paymentAmount > 0 ? "Member, membership, and payment saved together." : "Member and membership saved. Payment can be recorded later.", recordId: enrollment.member_id };
}

export async function updateMemberAction(
  memberId: string,
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { gymId } = await requireGymAdminContext();
  if (!isMemberId(memberId)) {
    return { status: "error", message: "This member could not be found." };
  }

  const parsed = editMemberSchema.safeParse({
    full_name: value(formData, "full_name"),
    phone: value(formData, "phone"),
    email: value(formData, "email"),
    gender: value(formData, "gender") === "not_specified" ? "" : value(formData, "gender"),
    date_of_birth: value(formData, "date_of_birth"),
    address: value(formData, "address"),
    notes: value(formData, "notes"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Review the highlighted fields and try again.", fieldErrors: fieldErrors(parsed.error) };
  }

  const selectedPhoto = photoFile(formData);
  const shouldRemovePhoto = value(formData, "photo_action") === "remove" && !selectedPhoto;
  const photoValidationError = await validateMemberPhotoFile(selectedPhoto);
  if (photoValidationError) return { status: "error", message: photoValidationError };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("members")
    .update(parsed.data)
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { status: "error", message: "The member could not be updated. Check that the record is still available and try again." };
  }

  if (selectedPhoto || shouldRemovePhoto) {
    const photoResult = await mutateMemberPhoto(supabase, gymId, memberId, selectedPhoto, shouldRemovePhoto);
    if (!photoResult.ok) return { status: "error", message: `Member details were saved, but the photo was not changed. ${photoResult.message}` };
  }

  revalidatePath("/gym/members");
  revalidatePath(`/gym/members/${memberId}`);
  revalidatePath(`/gym/members/${memberId}/edit`);
  return { status: "success", message: "Member details saved." };
}

export async function archiveMemberAction(memberId: string): Promise<FormActionState> {
  const { gymId } = await requireGymAdminContext();
  if (!isMemberId(memberId)) return { status: "error", message: "This member could not be found." };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("members")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .neq("status", "archived")
    .select("id")
    .maybeSingle();

  if (error || !data) return { status: "error", message: "The member could not be archived. Refresh the page and try again." };

  revalidatePath("/gym/members");
  revalidatePath("/gym/command-center");
  revalidatePath(`/gym/members/${memberId}`);
  return { status: "success", message: "Member archived. Membership, payment, attendance, and audit history have been preserved." };
}

export async function permanentlyDeleteArchivedMemberAction(memberId: string): Promise<FormActionState> {
  const { gymId } = await requireGymAdminContext();
  if (!isMemberId(memberId)) return { status: "error", message: "This member could not be found." };
  const supabase = await createServerSupabaseClient();
  const { data: member, error: lookupError } = await supabase.from("members").select("photo_path, status, archived_at, full_name").eq("id", memberId).eq("gym_id", gymId).maybeSingle();
  if (lookupError || !member || (member.status !== "archived" && !member.archived_at)) return { status: "error", message: "Only an archived member in this gym can be permanently deleted." };
  if (member.photo_path) {
    const { error } = await supabase.storage.from(memberPhotoBucket).remove([member.photo_path]);
    if (error) return { status: "error", message: "The private member photo could not be removed, so no records were deleted." };
  }
  const { error } = await supabase.rpc("permanently_delete_archived_member", { p_member_id: memberId });
  if (error) {
    if (member.photo_path) await supabase.from("members").update({ photo_path: null }).eq("id", memberId).eq("gym_id", gymId);
    console.error("Permanent member deletion failed", { code: error.code });
    return { status: "error", message: member.photo_path
      ? "Member records remain, but the photo was removed. The profile was updated to clear its photo reference. Retry after reviewing the error."
      : "Member records could not be deleted. No database records were removed." };
  }
  revalidatePath("/gym/members"); revalidatePath("/gym/command-center"); revalidatePath("/gym/attendance"); revalidatePath("/gym/reports");
  return { status: "success", message: "Archived member and associated records permanently deleted." };
}

export async function updateMemberPhotoAction(
  memberId: string,
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { gymId } = await requireGymAdminContext();
  if (!isMemberId(memberId)) return { status: "error", message: "This member could not be found." };

  const selectedPhoto = photoFile(formData);
  const shouldRemovePhoto = value(formData, "photo_action") === "remove" && !selectedPhoto;
  const validationError = await validateMemberPhotoFile(selectedPhoto);
  if (validationError) return { status: "error", message: validationError };
  if (!selectedPhoto && !shouldRemovePhoto) return { status: "error", message: "Choose a photo or select Remove photo." };

  const supabase = await createServerSupabaseClient();
  const result = await mutateMemberPhoto(supabase, gymId, memberId, selectedPhoto, shouldRemovePhoto);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/gym/members");
  revalidatePath(`/gym/members/${memberId}`);
  revalidatePath(`/gym/members/${memberId}/edit`);
  return { status: "success", message: result.message };
}
