import { createHmac } from "node:crypto";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  gymId: z.string().uuid(),
  memberId: z.string().regex(/^[0-9]{4}$/),
});

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "preview") {
    return Response.json({ ok: false }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false }, { status: 200, headers: { "Cache-Control": "no-store" } });

  const ip = request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    ?? "unknown";
  const clientKeyHash = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "")
    .update(ip)
    .digest("hex");

  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase.rpc("check_in_member_public", {
      p_gym_id: parsed.data.gymId,
      p_check_in_code: parsed.data.memberId,
      p_client_key_hash: clientKeyHash,
    });
    if (error) console.error("QR check-in request failed", { code: error.code });
    return Response.json({ ok: !error && data === "checked_in" }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("QR check-in request unavailable");
    return Response.json({ ok: false }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
