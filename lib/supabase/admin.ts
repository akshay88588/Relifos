import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * SERVICE-ROLE CLIENT - SERVER ONLY.
 *
 * Row Level Security is enabled on every table and there are NO client write
 * policies anywhere in the schema. Every write in this application therefore
 * flows through this client, inside a route handler, after an explicit role
 * check. The browser physically cannot write to the database.
 */
let cached: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

export function isConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
