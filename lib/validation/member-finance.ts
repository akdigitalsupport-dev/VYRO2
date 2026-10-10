import { z } from "zod";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string) {
  if (!isoDatePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const calendarDate = z.string().refine(isCalendarDate, "Enter a valid date.");

export const membershipAssignmentSchema = z.object({
  membership_plan_id: z.string().regex(uuidPattern, "Choose a valid membership plan."),
  start_date: calendarDate,
});

const paymentAmount = z.string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Enter an amount with no more than two decimal places.")
  .transform(Number)
  .refine((amount) => amount > 0, "Amount must be greater than zero.")
  .refine((amount) => amount <= 9_999_999_999.99, "Amount is too large.");

export const membershipPaymentAmountSchema = z.string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Enter an amount with no more than two decimal places.")
  .transform(Number)
  .refine((amount) => amount >= 0, "Payment cannot be negative.")
  .refine((amount) => amount <= 9_999_999_999.99, "Amount is too large.");

export const memberPaymentDetailsSchema = z.object({
  payment_date: calendarDate,
  payment_method: z.enum(["cash", "upi", "bank_transfer", "card", "other"]),
  reference: z.string().trim().max(120, "Reference must be 120 characters or fewer.").transform((value) => value || null),
  notes: z.string().trim().max(500, "Notes must be 500 characters or fewer.").transform((value) => value || null),
});

export const memberPaymentSchema = memberPaymentDetailsSchema.extend({ amount: paymentAmount });

/** Parse the raw PostgreSQL numeric price without accepting formatted or lossy values. */
export function parseMembershipPlanPrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 && value <= 9_999_999_999.99 ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 && amount <= 9_999_999_999.99 ? amount : null;
}

export type MembershipUiStatus = "active" | "upcoming" | "expired" | "cancelled";

export function deriveMembershipStatus(
  databaseStatus: string,
  startDate: string,
  endDate: string,
  today: string,
): MembershipUiStatus {
  if (databaseStatus === "cancelled") return "cancelled";
  if (today < startDate) return "upcoming";
  if (today > endDate) return "expired";
  return "active";
}

export function addDaysToIsoDate(value: string, days: number) {
  if (!isCalendarDate(value) || !Number.isInteger(days)) return "";
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateInTimeZone(date: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

/** Returns an ISO timestamp at noon on a calendar date in the requested time zone. */
export function dateAtLocalNoonIso(value: string, timeZone: string) {
  if (!isCalendarDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const targetLocalAsUtc = Date.UTC(year, month - 1, day, 12);
  let candidate = targetLocalAsUtc;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const adjustment = targetLocalAsUtc - renderedAsUtc;
    candidate += adjustment;
    if (adjustment === 0) break;
  }

  return new Date(candidate).toISOString();
}

export function memberPaymentStatusLabel(status: string) {
  if (status === "completed") return "Paid";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
