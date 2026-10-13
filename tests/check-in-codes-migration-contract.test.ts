import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readdirSync(path.join(process.cwd(), "supabase/migrations"))
  .filter((name) => name.endsWith("_qr_self_checkin.sql"))[0];
const sql = migration ? readFileSync(path.join(process.cwd(), "supabase/migrations", migration), "utf8") : "";

describe("QR self-check-in migration contract", () => {
  it("stores public codes as four-digit text and preserves UUID relations", () => {
    expect(sql).toMatch(/check_in_code text not null check \(check_in_code ~ '\^\[0-9\]\{4\}\$'\)/i);
    expect(sql).toMatch(/unique \(gym_id, check_in_code\)/i);
    expect(sql).toMatch(/foreign key \(member_id, gym_id\) references public\.members\(id, gym_id\)/i);
    expect(sql).not.toMatch(/update public\.members\s+set\s+check_in_code/i);
  });

  it("keeps attempts and codes private and restricts the public attendance RPC", () => {
    expect(sql).toMatch(/alter table private\.member_checkin_codes enable row level security/i);
    expect(sql).toMatch(/alter table private\.qr_checkin_rate_limits enable row level security/i);
    expect(sql).toMatch(/revoke all on function public\.check_in_member_public\(uuid, text, text\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.check_in_member_public\(uuid, text, text\) to service_role/i);
    expect(sql).toMatch(/current_attempts > 10/i);
  });

  it("enforces gym-local membership validity and uses the existing atomic daily unique key", () => {
    expect(sql).toMatch(/now\(\) at time zone coalesce\(gym_timezone, 'Asia\/Kolkata'\)/i);
    expect(sql).toMatch(/mm\.start_date <= local_day and mm\.end_date >= local_day/i);
    expect(sql).toMatch(/on conflict \(gym_id, member_id, attendance_date\) do nothing/i);
    expect(sql).toMatch(/return 'unavailable'/i);
  });
});
