import { describe, expect, it } from "vitest";
import { publicSchema, serverSchema } from "@/lib/env";

describe("environment schemas", () => {
  it("rejects incomplete public env", () => {
    const result = publicSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "short",
    });
    expect(result.success).toBe(false);
  });

  it("requires service role only on the server schema", () => {
    const publicOk = publicSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(20),
    });
    const serverMissing = serverSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(20),
    });
    expect(publicOk.success).toBe(true);
    expect(serverMissing.success).toBe(false);
  });
});
