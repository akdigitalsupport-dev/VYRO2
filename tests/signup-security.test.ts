import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const signupSource = readFileSync(path.join(process.cwd(), "app/(auth)/signup/page.tsx"), "utf8");

describe("disabled public signup", () => {
  it("has no account-creation action or Supabase signup call", () => {
    expect(signupSource).not.toMatch(/\bsignUp\s*\(/);
    expect(signupSource).not.toMatch(/createBrowserSupabaseClient|createAdminSupabaseClient/);
    expect(signupSource).not.toMatch(/\baction\s*=/);
    expect(signupSource).toMatch(/<Button[^>]*type="submit"[^>]*disabled/);
  });

  it("has no client-controlled role assignment", () => {
    expect(signupSource).not.toMatch(/name=["']role["']/i);
    expect(signupSource).not.toMatch(/platform_owner|gym_admin/);
    expect(signupSource).not.toMatch(/"use client"|"use server"/);
  });
});
