"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformOwner } from "@/lib/auth/guards";
import type { FormActionState } from "@/lib/forms";
import { publicEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const createGymTrialSchema = z.object({
  gym_name: z.string().trim().min(2, "Enter a gym name.").max(160),
  owner_name: z.string().trim().min(1, "Enter the owner's name.").max(120),
  owner_email: z.string().trim().email("Enter a valid owner email.").max(254).transform((value) => value.toLowerCase()),
  owner_phone: z.string().trim().max(40).optional().default(""),
  address_line: z.string().trim().max(500).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  state: z.string().trim().max(120).optional().default(""),
  country: z.string().trim().min(1).max(120).default("India"),
  trial_days: z.coerce.number().int().min(1).max(90),
});

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field && !result[field]) result[field] = issue.message;
  }
  return result;
}

function todayInIndia(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function createGymTrialAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  await requirePlatformOwner();

  // Preview builds are allowed to inspect production-backed screens, but cannot
  // create Auth users or write live tenant data. This is a second safety barrier.
  if (process.env.VERCEL_ENV !== "production") {
    return {
      status: "error",
      message: "Creating gyms is disabled in preview builds to protect production data. This action is enabled only in the approved production release.",
    };
  }

  const parsed = createGymTrialSchema.safeParse({
    gym_name: formValue(formData, "gym_name"),
    owner_name: formValue(formData, "owner_name"),
    owner_email: formValue(formData, "owner_email"),
    owner_phone: formValue(formData, "owner_phone"),
    address_line: formValue(formData, "address_line"),
    city: formValue(formData, "city"),
    state: formValue(formData, "state"),
    country: formValue(formData, "country") || "India",
    trial_days: formValue(formData, "trial_days"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the highlighted fields and try again.",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  const input = parsed.data;
  const address = [
    input.address_line,
    input.city,
    input.state,
    input.country,
  ].filter(Boolean).join(", ").slice(0, 1000);

  let redirectTo: string;
  try {
    if (!publicEnv.siteUrl) throw new Error("Missing site URL");
    const site = new URL(publicEnv.siteUrl);
    if (site.protocol !== "https:") throw new Error("Invalid site URL");
    redirectTo = new URL("/auth/redirect", site).toString();
  } catch {
    return {
      status: "error",
      message: "The platform site URL is not configured correctly. No owner invite or gym was created.",
    };
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return {
      status: "error",
      message: "Secure owner invitations are not configured. No owner invite or gym was created.",
    };
  }

  // A new owner must accept an invitation. Existing accounts are never silently
  // reassigned or granted access by the platform creation form.
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    input.owner_email,
    {
      data: { display_name: input.owner_name },
      redirectTo,
    },
  );

  const invitedUser = inviteData.user;
  if (inviteError || !invitedUser) {
    if (inviteError) {
      console.warn("Platform owner invitation could not be sent", { code: inviteError.name });
    }
    return {
      status: "error",
      message: "The owner invitation could not be sent. The email may already have a VYRO account, or email invitations may need configuration. No gym was created.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data: provisioned, error: provisionError } = await supabase.rpc(
    "provision_platform_trial_gym",
    {
      p_owner_user_id: invitedUser.id,
      p_gym_name: input.gym_name,
      p_owner_name: input.owner_name,
      p_owner_email: input.owner_email,
      p_owner_phone: input.owner_phone || null,
      p_address: address || null,
      p_trial_days: input.trial_days,
      p_starts_on: todayInIndia(),
    },
  );

  const record = Array.isArray(provisioned) ? provisioned[0] : null;
  if (provisionError || !record?.gym_id || !record?.subscription_id) {
    // The database RPC is transactional. Remove the unassigned invited account
    // if tenant provisioning fails, so no partial gym or orphaned account remains.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(invitedUser.id);
    if (cleanupError) {
      console.error("Platform tenant provisioning failed and invited-account cleanup needs review", {
        code: provisionError?.code,
        cleanupCode: cleanupError.name,
      });
    } else {
      console.error("Platform tenant provisioning failed; invited account cleaned up", {
        code: provisionError?.code,
      });
    }
    if (provisionError?.code === "PGRST202" || provisionError?.message?.includes("provision_platform_trial_gym")) {
      return {
        status: "error",
        message: "The reviewed tenant-foundation migration is not installed in this environment. No gym was created. The invitation was cancelled.",
      };
    }
    return {
      status: "error",
      message: "Gym setup could not be completed. The database transaction was rolled back and the invited account was cleaned up where possible.",
    };
  }

  revalidatePath("/platform");
  revalidatePath("/platform/gyms");
  revalidatePath("/platform/gyms/trials");
  revalidatePath("/platform/trials");
  revalidatePath("/platform/gyms/active");
  return {
    status: "success",
    message: `Gym created and a setup invitation sent to ${input.owner_email}. The ${input.trial_days}-day free trial is active.`,
    recordId: record.gym_id,
  };
}
