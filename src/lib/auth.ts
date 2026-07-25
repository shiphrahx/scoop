import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// The signed-in user, resolved ONCE per request.
//
// `auth.getUser()` is a round trip to Supabase — it validates the JWT rather
// than trusting the cookie — and a single page render used to make a dozen of
// them (every query helper asked again). On a phone those add up to seconds of
// blank screen. React's `cache` scopes the answer to the request, which is
// exactly as long as it can't change.
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// The gate every server action shares: resolve the signed-in user (validated
// against Supabase, not just a decoded cookie) and hand back a client bound to
// their session. Throws when there's no user so callers can assume one.
export async function requireUser() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}
