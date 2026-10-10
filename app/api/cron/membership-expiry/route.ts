import "server-only";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type ClaimedDeliveryRow = { delivery_id: string; notification_id: string; subscription_id: string; attempt_count: number };
type DeliveryRow = { id: string; notification_id: string; subscription_id: string; attempt_count: number };
type NotificationRow = { id: string; title: string; message: string; entity_type: string | null; entity_id: string | null };
type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth_key: string };

function authorized(request: Request, secret: string) {
  const supplied = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function notificationUrl(row: NotificationRow) {
  if (row.entity_type === "member_membership") return "/gym/members";
  return "/gym/command-center";
}

export async function GET(request: Request) {
  const missing = [
    "CRON_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
  ].filter((name) => !process.env[name]);
  if (missing.length) return Response.json({ error: "push_configuration_missing", required: missing }, { status: 503 });
  if (!authorized(request, process.env.CRON_SECRET!)) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  } catch {
    return Response.json({ error: "vapid_configuration_invalid" }, { status: 503 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const { data: materialized, error: materializeError } = await supabase.rpc("materialize_membership_expiry_notifications");
    if (materializeError) {
      console.error("Expiry notification materialization failed", { code: materializeError.code });
      return Response.json({ error: "notification_materialization_failed" }, { status: 500 });
    }

    const { data: deliveries, error: deliveryError } = await supabase.rpc("claim_push_delivery_attempts", { p_limit: 100 });
    if (deliveryError) {
      console.error("Push delivery queue could not be read", { code: deliveryError.code });
      return Response.json({ error: "delivery_queue_unavailable" }, { status: 500 });
    }
    const queued = ((deliveries ?? []) as ClaimedDeliveryRow[]).map((row) => ({ ...row, id: row.delivery_id })) as DeliveryRow[];
    if (!queued.length) return Response.json({ createdEvents: Number(materialized ?? 0), delivered: 0, failed: 0 });

    const notificationIds = [...new Set(queued.map((row) => row.notification_id))];
    const subscriptionIds = [...new Set(queued.map((row) => row.subscription_id))];
    const [{ data: notifications, error: notificationsError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
      supabase.from("notifications").select("id, title, message, entity_type, entity_id").in("id", notificationIds),
      supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth_key").in("id", subscriptionIds).is("disabled_at", null),
    ]);
    if (notificationsError || subscriptionsError) return Response.json({ error: "delivery_data_unavailable" }, { status: 500 });
    const notificationById = new Map(((notifications ?? []) as NotificationRow[]).map((row) => [row.id, row]));
    const subscriptionById = new Map(((subscriptions ?? []) as SubscriptionRow[]).map((row) => [row.id, row]));
    let delivered = 0;
    let failed = 0;

    for (let offset = 0; offset < queued.length; offset += 20) {
      await Promise.all(queued.slice(offset, offset + 20).map(async (delivery) => {
        const notification = notificationById.get(delivery.notification_id);
        const subscription = subscriptionById.get(delivery.subscription_id);
        const attemptCount = delivery.attempt_count;
        if (!notification || !subscription) {
          await supabase.from("push_delivery_attempts").update({ status: "disabled", lease_until: null, last_error: "Subscription or notification is no longer available" }).eq("id", delivery.id);
          failed += 1;
          return;
        }
        try {
          await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } }, JSON.stringify({
            title: notification.title,
            body: notification.message,
            tag: `vyro-${notification.id}`,
            url: notificationUrl(notification),
          }), { TTL: 86400 });
          const { error } = await supabase.from("push_delivery_attempts").update({ status: "sent", lease_until: null, delivered_at: new Date().toISOString(), last_error: null, last_status_code: null }).eq("id", delivery.id);
          if (error) throw new Error("delivery_status_update_failed");
          delivered += 1;
        } catch (cause) {
          const statusCode = Number((cause as { statusCode?: number }).statusCode ?? 0) || null;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscriptions").update({ disabled_at: new Date().toISOString() }).eq("id", subscription.id);
          }
          const endpointExpired = statusCode === 404 || statusCode === 410;
          const exhausted = attemptCount >= 5;
          const retryHours = Math.min(24 * 7, 2 ** attemptCount);
          await supabase.from("push_delivery_attempts").update({
            status: endpointExpired ? "disabled" : "failed",
            lease_until: null,
            last_status_code: statusCode,
            last_error: statusCode ? `Push service returned HTTP ${statusCode}` : "Push delivery failed; retry scheduled",
            next_attempt_at: new Date(Date.now() + (exhausted ? 24 * 365 : retryHours) * 3600000).toISOString(),
          }).eq("id", delivery.id);
          failed += 1;
        }
      }));
    }

    return Response.json({ createdEvents: Number(materialized ?? 0), delivered, failed, checked: queued.length });
  } catch (cause) {
    console.error("Membership expiry cron failed", { error: cause instanceof Error ? cause.name : "unknown" });
    return Response.json({ error: "membership_expiry_cron_failed" }, { status: 500 });
  }
}
