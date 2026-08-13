import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function getBrowserSupabase(): SupabaseClient {
    if (client) return client;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
    const key =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() ?? "";
    if (!url || !key) {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY must be set when NEXT_PUBLIC_MIKE_AUTH_PROVIDER=supabase",
        );
    }
    client = createClient(url, key);
    return client;
}
