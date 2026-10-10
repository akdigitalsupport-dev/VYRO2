import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.redirect(new URL("/login?reason=configuration", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.redirect(new URL("/login", request.url));

  // Preview and deployment-preview URLs currently share production Supabase
  // configuration. Block ALL Server Actions under workspaces in preview to make
  // old and new mutation paths equally safe, including actions not yet guarded
  // individually. GET requests remain available for read-only review.
  if (
    process.env.VERCEL_ENV === "preview" &&
    request.method === "POST" &&
    request.headers.has("next-action")
  ) {
    return new NextResponse("Server actions are disabled in preview to protect production data.", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return response;
}

export const config = { matcher: ["/platform/:path*", "/gym/:path*"] };
