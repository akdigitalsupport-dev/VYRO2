import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addIsoDays, isValidTimeZone, localDateInTimeZone } from "@/lib/dates";

export type DashboardSummary = {
  total_gyms?: number;
  active_gyms?: number;
  expiring_gyms?: number;
  inactive_gyms?: number;
  active_members?: number;
  month_revenue?: number | string;
  today_revenue?: number | string;
  currency?: string;
  upcoming_renewals?: number;
  total_members?: number;
  expiring_members?: number;
  expired_members?: number;
  today_attendance?: number;
};

export async function getPlatformDashboardData() {
  const supabase = await createSupabaseServerClient();
  const { data: platformSettings, error: settingsError } = await supabase.from("platform_settings").select("default_timezone, default_currency").eq("id", 1).maybeSingle();
  const timeZone = platformSettings?.default_timezone && isValidTimeZone(platformSettings.default_timezone) ? platformSettings.default_timezone : "Asia/Kolkata";
  const today = localDateInTimeZone(timeZone);
  const [summaryResult, renewalResult, activityResult] = await Promise.all([
    supabase.rpc("get_platform_dashboard_summary"),
    supabase.from("platform_subscriptions")
      .select("id, plan_name, expires_on, status, gyms(name)")
      .in("status", ["active", "trial", "past_due"])
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
    settingsError,
    summaryError: summaryResult.error,
    renewals: renewalResult.data || [],
    renewalsError: renewalResult.error,
    activities: activityResult.data || [],
    activityError: activityResult.error,
  };
}

export async function getGymDashboardData(gymId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: settings, error: settingsError } = await supabase.from("gym_settings").select("timezone, currency").eq("gym_id", gymId).maybeSingle();
  const timeZone = settings?.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : "Asia/Kolkata";
  const today = localDateInTimeZone(timeZone);
  const [summaryResult, gymResult, renewalResult, activityResult, paymentResult] = await Promise.all([
    supabase.rpc("get_gym_dashboard_summary", { target_gym_id: gymId }),
    supabase.from("gyms").select("name").eq("id", gymId).maybeSingle(),
    supabase.from("member_memberships")
      .select("id, member_id, end_date", { count: "exact" })
      .eq("gym_id", gymId).eq("status", "active")
      .gte("end_date", today).lte("end_date", addIsoDays(today, 30))
      .order("end_date", { ascending: true }).limit(5),
    supabase.from("audit_logs")
      .select("id, action, entity_type, created_at")
      .eq("gym_id", gymId).order("created_at", { ascending: false }).limit(5),
    supabase.from("member_payments")
      .select("id, member_id, amount, currency, payment_method, payment_date, status, reference")
      .eq("gym_id", gymId).order("payment_date", { ascending: false }).limit(5),
  ]);
  const recentPayments = paymentResult.data || [];
  const paymentMemberIds = [...new Set(recentPayments.map((payment) => payment.member_id))];
  const { data: paymentMembers } = paymentMemberIds.length
    ? await supabase.from("members").select("id, full_name").eq("gym_id", gymId).in("id", paymentMemberIds)
    : { data: [] };
  const paymentNames = new Map((paymentMembers || []).map((member) => [member.id, member.full_name]));
  const renewalRows = renewalResult.data || [];
  const renewalMemberIds = [...new Set(renewalRows.map((row) => row.member_id))];
  const { data: renewalMembers } = renewalMemberIds.length
    ? await supabase.from("members").select("id, full_name").eq("gym_id", gymId).in("id", renewalMemberIds)
    : { data: [] };
  const renewalNames = new Map((renewalMembers || []).map((member) => [member.id, member.full_name]));
  return {
    summary: summaryResult.data?.[0] as DashboardSummary | undefined,
    currency: settings?.currency || "INR",
    timeZone,
    settingsError,
    summaryError: summaryResult.error,
    gym: gymResult.data,
    gymError: gymResult.error,
    renewals: renewalRows.map((row) => ({ id: row.id, full_name: renewalNames.get(row.member_id) || "Member", membership_expires_on: row.end_date })),
    renewalsError: renewalResult.error,
    upcomingRenewals: renewalResult.count,
    activities: activityResult.data || [],
    activityError: activityResult.error,
    recentPayments: recentPayments.map((payment) => ({
      ...payment, full_name: paymentNames.get(payment.member_id) || "Member",
    })),
    paymentError: paymentResult.error,
  };
}

export function formatCurrency(amount: number | string | undefined, currency = "INR") {
  const value = Number(amount || 0);
  const normalizedCurrency = /^[A-Z]{3}$/.test(currency) ? currency : "INR";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: normalizedCurrency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
  }
}

export function formatDate(date: string | null | undefined) {
  if (!date) return "—";
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}

export function formatDateTime(value: string, timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}
