import { z } from "zod";

const validDateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
};

const optionalText = (maxLength: number, label: string) =>
  z.string().trim().max(maxLength, `${label} must be ${maxLength} characters or fewer.`).transform((value) => value || null);

const optionalDate = z
  .string()
  .refine((value) => value === "" || validDateOnly(value), "Enter a valid date.")
  .transform((value) => value || null);

const optionalEmail = z
  .string()
  .trim()
  .max(254, "Email must be 254 characters or fewer.")
  .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a valid email address.")
  .transform((value) => value || null);

const optionalGender = z
  .enum(["female", "male", "non_binary", "prefer_not_to_say", ""])
  .transform((value) => value || null);

export const createMemberSchema = z
  .object({
    full_name: z.string().trim().min(1, "Enter the member's name.").max(160, "Name must be 160 characters or fewer."),
    phone: optionalText(32, "Phone"),
    email: optionalEmail,
    gender: optionalGender,
    date_of_birth: optionalDate,
    address: optionalText(1000, "Address"),
    joining_date: z.string().refine(validDateOnly, "Enter a valid joining date."),
    notes: optionalText(2000, "Notes"),
    membership_plan_id: z.string().uuid("Choose an active membership plan."),
    membership_start_date: z.string().refine(validDateOnly, "Enter a valid membership start date."),
  })
  .superRefine((value, context) => {
    if (value.date_of_birth && value.date_of_birth > value.joining_date) {
      context.addIssue({ code: "custom", path: ["date_of_birth"], message: "Date of birth must be on or before the joining date." });
    }
    if (value.membership_start_date < value.joining_date) {
      context.addIssue({ code: "custom", path: ["membership_start_date"], message: "Membership cannot start before the joining date." });
    }
  });

export const editMemberSchema = z
  .object({
    full_name: z.string().trim().min(1, "Enter the member's name.").max(160, "Name must be 160 characters or fewer."),
    phone: optionalText(32, "Phone"),
    email: optionalEmail,
    gender: optionalGender,
    date_of_birth: optionalDate,
    address: optionalText(1000, "Address"),
    notes: optionalText(2000, "Notes"),
  })
  .superRefine((value, context) => {
    const today = new Date().toISOString().slice(0, 10);
    if (value.date_of_birth && value.date_of_birth > today) {
      context.addIssue({ code: "custom", path: ["date_of_birth"], message: "Date of birth cannot be in the future." });
    }
  });

export type CreateMemberValues = z.output<typeof createMemberSchema>;
export type EditMemberValues = z.output<typeof editMemberSchema>;

export function isValidDateOnly(value: string) {
  return validDateOnly(value);
}
