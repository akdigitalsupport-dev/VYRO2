import { z } from "zod";
export { calculateMembershipEndDate } from "./membership-dates.js";

const isoDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "Enter a valid calendar date.");

const optionalIsoDate = z.union([z.literal(""), isoDate]).optional();
const optionalText = (max) => z.string().trim().max(max).optional();
const phone = z.string().trim().min(7).max(40).refine((value) => (value.match(/\d/g) || []).length >= 7, "Enter a valid phone number.");
const optionalEmail = z.union([z.email().max(254), z.literal("")]).optional();
const gender = z.enum(["", "female", "male", "non_binary", "prefer_not_to_say"]).optional();

export const planSchema = z.object({
  name: z.string().trim().min(1).max(120),
  duration_days: z.coerce.number().int().min(1).max(3650),
  price: z.coerce.number().finite().min(0).max(10000000)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, "Price can have at most two decimal places."),
  description: optionalText(1000),
});

export const updatePlanSchema = planSchema.extend({ id: z.string().uuid() });

export const createMemberSchema = z.object({
  full_name: z.string().trim().min(1).max(160),
  phone,
  email: optionalEmail,
  gender,
  date_of_birth: optionalIsoDate,
  address: optionalText(500),
  joining_date: isoDate,
  notes: optionalText(2000),
  membership_plan_id: z.string().uuid(),
  membership_start_date: isoDate,
}).superRefine((value, context) => {
  if (value.date_of_birth && value.date_of_birth > value.joining_date) context.addIssue({ code: "custom", path: ["date_of_birth"], message: "Date of birth must precede joining date." });
  if (value.membership_start_date < value.joining_date) context.addIssue({ code: "custom", path: ["membership_start_date"], message: "Membership cannot start before the joining date." });
});

export const updateMemberSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(160),
  phone: z.union([phone, z.literal("")]).optional(),
  email: optionalEmail,
  gender,
  date_of_birth: optionalIsoDate,
  address: optionalText(500),
  notes: optionalText(2000),
  status: z.enum(["active", "inactive"]),
});

export const membershipAssignmentSchema = z.object({
  member_id: z.string().uuid(),
  membership_plan_id: z.string().uuid(),
  start_date: isoDate,
});
