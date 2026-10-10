import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(path.join(root, "supabase/migrations/202610090002_optional_registration_fee_and_web_push.sql"), "utf8").toLowerCase();
const route = readFileSync(path.join(root, "app/api/cron/membership-expiry/route.ts"), "utf8");
const worker = readFileSync(path.join(root, "public/sw.js"), "utf8");
const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as { crons: Array<{ path: string; schedule: string }> };

describe("membership expiry Web Push contract (static checks; not deployed device tests)", () => {
  it("uses the existing notification tables and a single daily Vercel Cron", () => {
    expect(migration).toContain("public.notifications(");
    expect(migration).toContain("create table public.membership_notification_events");
    expect(vercel.crons).toEqual([{ path: "/api/cron/membership-expiry", schedule: "30 0 * * *" }]);
  });

  it("creates one logical event per gym, membership, type, and local event date", () => {
    expect(migration).toContain("unique (gym_id, membership_id, event_type, event_date)");
    expect(migration).toContain("on conflict on constraint membership_notification_events_unique do nothing");
    expect(migration).toContain("statement_timestamp() at time zone gym_row.timezone");
    expect(migration).toContain("('membership_expiring'::text, 3)");
    expect(migration).toContain("('membership_expired'::text, 0)");
  });

  it("excludes archived members and cancelled memberships, preserving inclusive expiry-date semantics", () => {
    expect(migration).toContain("mm.status <> 'cancelled'");
    expect(migration).toContain("m.status <> 'archived' and m.archived_at is null");
    expect(migration).toContain("mm.start_date <= local_today");
    expect(migration).toContain("mm.end_date = local_today + event.days_before");
  });

  it("restricts subscriptions to the signed-in owner and delivery records to the server role", () => {
    expect(migration).toContain("user_id = (select auth.uid())");
    expect(migration).toContain("public.has_gym_access(gym_id)");
    expect(migration).toContain("grant select, insert, update, delete on public.push_subscriptions to authenticated");
    expect(migration).toContain("grant all on public.push_delivery_attempts to service_role");
  });

  it("authenticates cron calls and records safe, retryable delivery outcomes", () => {
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(route).toContain("VAPID_PRIVATE_KEY");
    expect(route).toContain("attempt_count");
    expect(route).toContain('status: endpointExpired ? "disabled" : "failed"');
    expect(route).not.toMatch(/console\.(?:log|error)\([^\n]*(?:endpoint|auth_key|private_key)/i);
  });

  it("limits service-worker navigation to same-origin relative paths", () => {
    expect(worker).toContain("url.startsWith(\"//\")");
    expect(worker).toContain("target.origin !== self.location.origin");
  });
});
