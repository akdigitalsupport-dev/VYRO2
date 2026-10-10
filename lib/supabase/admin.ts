import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

/**
 * Platform-level client. Uses the service role key.
 * Never import this file from a Client Component or any browser bundle.
 * Cross-tenant operations must still check platform-admin authorization in later phases.
 */
export function createAdminSupabaseClient() {
  const env = getServerEnv();

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
