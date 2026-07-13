import { createClient } from "@/lib/supabase/server";

// The gate every server action shares: resolve the signed-in user (validated
// against Supabase, not just a decoded cookie) and hand back a client bound to
// their session. Throws when there's no user so callers can assume one.
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}
