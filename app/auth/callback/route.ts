import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.redirect(new URL("/login?reason=configuration", request.url));
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next") || "/auth/set-password";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/auth/set-password";
  if (!code) return NextResponse.redirect(new URL("/login?reason=invite", request.url));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?reason=invite", request.url));
  return NextResponse.redirect(new URL(next, request.url));
}
