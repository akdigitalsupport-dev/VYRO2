import { z } from "zod";

const planPrice = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter a non-negative price with up to 2 decimal places.")
  .transform(Number);

const planDuration = z
  .string()
  .trim()
  .regex(/^\d+$/, "Duration must be a positive whole number of days.")
  .refine((value) => Number(value) > 0, "Duration must be a positive whole number of days.")
  .refine((value) => Number.isSafeInteger(Number(value)), "Enter a valid duration.")
  .transform(Number);

export const planSchema = z.object({
  name: z.string().trim().min(1, "Enter a plan name.").max(120, "Plan name must be 120 characters or fewer."),
  duration_days: planDuration,
  price: planPrice,
  description: z.string().trim().max(2000, "Description must be 2000 characters or fewer.").transform((value) => value || null),
  is_active: z.boolean(),
});

export type PlanValues = z.output<typeof planSchema>;
