import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addIsoDays, isValidTimeZone, localDateInTimeZone } from "@/lib/dates";

export type DashboardSummary = {
  total_gyms?: number;
  active_gyms?: number;
  expiring_gyms?: number;
  inactive_gyms?: number;
  active_members?: number;
  month_revenue?: number | string;
  currency?: string;
  upcoming_renewals?: number;
  total_members?: number;
  expiring_members?: number;
  today_attendance?: number;
};

export async function getPlatformDashboardData() {
  const supabase = await createSupabaseServerClient();
  const { data: platformSettings } = await supabase.from("platform_settings").select("default_timezone, default_currency").eq("id", 1).maybeSingle();
  const timeZone = platformSettings?.default_timezone && isValidTimeZone(platformSettings.default_timezone) ? platformSettings.default_timezone : "Asia/Kolkata";
  const today = localDateInTimeZone(timeZone);
  const [summaryResult, renewalResult, activityResult] = await Promise.all([
    supabase.rpc("get_platform_dashboard_summary"),
    supabase.from("platform_subscriptions")
      .select("id, plan_name, expires_on, status, gyms(name)")
      .eq("status", "active")
      .gte("expires_on", today).lte("expires_on", addIsoDays(today, 30))
      .order("expires_on", { ascending: true }).limit(5),
    supabase.from("audit_logs")
      .select("id, action, entity_type, created_at")
      .order("created_at", { ascending: false }).limit(5),
  ]);
  return {
    summary: summaryResult.data?.[0] as DashboardSummary | undefined,
    currency: platformSettings?.default_currency || "INR",
    timeZone,
    summaryError: summaryResult.error,
    renewals: renewalResult.data || [],
    renewalsError: renewalResult.error,
    activities: activityResult.data || [],
    activityError: activityResult.error,
  };
}

export async function getGymDashboardData(gymId: string) {
  const supabase = await createSupabaseServerClient();
  const [summaryResult, gymResult, settingsResult, renewalResult, activityResult] = await Promise.all([
    supabase.rpc("get_gym_dashboard_summary", { target_gym_id: gymId }),
    supabase.from("gyms").select("name").eq("id", gymId).maybeSingle(),
    supabase.from("gym_settings").select("timezone, currency").eq("gym_id", gymId).maybeSingle(),
    supabase.from("members")
      .select("id, full_name, membership_expires_on, status")
      .eq("gym_id", gymId).is("archived_at", null)
      .in("status", ["expiring", "expired"])
      .order("membership_expires_on", { ascending: true }).limit(5),
    supabase.from("audit_logs")
      .select("id, action, entity_type, created_at")
      .eq("gym_id", gymId).order("created_at", { ascending: false }).limit(5),
  ]);
  return {
    summary: summaryResult.data?.[0] as DashboardSummary | undefined,
    currency: settingsResult.data?.currency || "INR",
    timeZone: settingsResult.data?.timezone || "Asia/Kolkata",
    summaryError: summaryResult.error,
    gym: gymResult.data,
    gymError: gymResult.error,
    renewals: renewalResult.data || [],
    renewalsError: renewalResult.error,
    activities: activityResult.data || [],
    activityError: activityResult.error,
  };
}

export function formatCurrency(amount: number | string | undefined, currency = "INR") {
  const value = Number(amount || 0);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function formatDate(date: string | null | undefined) {
  if (!date) return "—";
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

export function formatDateTime(value: string, timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}
