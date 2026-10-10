import { z } from "zod";

const publicSchemaFields = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
});

const publicSchema = publicSchemaFields.refine(
  (value) => Boolean(value.NEXT_PUBLIC_SUPABASE_ANON_KEY || value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  { message: "A public Supabase key is required." },
);

const serverSchema = publicSchemaFields.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
}).refine(
  (value) => Boolean(value.NEXT_PUBLIC_SUPABASE_ANON_KEY || value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  { message: "A public Supabase key is required." },
);

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
};

export function isSupabaseConfigured() {
  return publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: publicEnv.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicEnv.supabaseAnonKey,
  }).success;
}

export function getPublicEnv() {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    throw new Error("Public Supabase environment variables are missing or invalid.");
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY || parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  };
}

export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("Server environment must not be read in the browser.");
  }

  const parsed = serverSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    throw new Error("Server environment is not configured. Copy .env.example to .env.local.");
  }

  return parsed.data;
}

export { publicSchema, serverSchema };
