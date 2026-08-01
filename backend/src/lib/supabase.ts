import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service-role key.
 *
 * This is MikeOSS's upstream persistence path. The service role bypasses RLS,
 * so callers must authenticate the request and scope every query to the
 * current user before using this client.
 */
export function createServerSupabase() {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const key = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SECRET_KEY must be set when MIKE_DATABASE_PROVIDER=supabase",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
