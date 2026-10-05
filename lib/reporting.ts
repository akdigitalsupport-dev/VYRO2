import "server-only";
import { addIsoDays, isValidIsoDate, isValidTimeZone, localDateInTimeZone } from "@/lib/dates";

export type ReportPreset = "today" | "yesterday" | "last_7_days" | "last_30_days" | "current_month" | "previous_month" | "custom";
export type DateRange = { from: string; to: string; error?: string };

export function resolveDateRange(presetValue: string | undefined, fromValue: string | undefined, toValue: string | undefined, timeZone: string): DateRange {
  const zone = isValidTimeZone(timeZone) ? timeZone : "Asia/Kolkata";
  const today = localDateInTimeZone(zone);
  const preset: ReportPreset = ["today", "yesterday", "last_7_days", "last_30_days", "current_month", "previous_month", "custom"].includes(presetValue || "")
    ? presetValue as ReportPreset : "last_30_days";
  if (preset === "custom") {
    if (!fromValue || !toValue || !isValidIsoDate(fromValue) || !isValidIsoDate(toValue)) return { from: "", to: "", error: "Enter valid start and end dates." };
    if (fromValue > toValue) return { from: fromValue, to: toValue, error: "Start date must be on or before end date." };
    const span = (Date.parse(`${toValue}T00:00:00Z`) - Date.parse(`${fromValue}T00:00:00Z`)) / 86_400_000;
    if (span > 365) return { from: fromValue, to: toValue, error: "Choose a date range of 366 days or less." };
    return { from: fromValue, to: toValue };
  }
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") { const day = addIsoDays(today, -1); return { from: day, to: day }; }
  if (preset === "last_7_days") return { from: addIsoDays(today, -6), to: today };
  if (preset === "last_30_days") return { from: addIsoDays(today, -29), to: today };
  const monthStart = `${today.slice(0, 7)}-01`;
  if (preset === "current_month") return { from: monthStart, to: today };
  const previousMonthEnd = addIsoDays(monthStart, -1);
  return { from: `${previousMonthEnd.slice(0, 7)}-01`, to: previousMonthEnd };
}

export function safeAuditMetadata(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const allowed = new Set(["from", "to", "outcome", "start_date", "end_date"]);
  return Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => allowed.has(key) && (typeof item === "string" || typeof item === "number" || typeof item === "boolean"))
    .map(([key, item]) => [key.replaceAll("_", " "), String(item).slice(0, 80)]);
}
