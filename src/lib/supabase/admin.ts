import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client. Bypasses row level security, so it is ONLY for server
// code that has no user session and must resolve the user itself — right now
// just the Apple Health Auto Export ingest endpoint, which authenticates with
// a per-user token instead of a cookie. Never import this into the browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and URL) must be set for the admin client.",
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
