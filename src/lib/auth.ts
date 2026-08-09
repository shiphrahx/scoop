import { cache } from "react";
import type { UserMetadata } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// The fields of the signed-in user the app actually reads. Drawn from the JWT
// claims rather than a full User row, because everything downstream only needs
// the id, email, and the OAuth display name.
export type SessionUser = {
  id: string;
  email?: string;
  user_metadata: UserMetadata;
};

// The signed-in user, resolved ONCE per request.
//
// This used to call `auth.getUser()`, a network round trip to Supabase on
// every render and every server action. The root middleware already validates
// and refreshes the token against Supabase on the way in, so inside the render
// we can trust the cookie and read the identity straight from the JWT with
// `getClaims()`. With asymmetric signing keys that verification is local (no
// network); on legacy symmetric secrets it transparently falls back to a
// `getUser()` call, so this is never slower than before. React's `cache` still
// scopes the answer to the request, which is exactly as long as it can't change.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const { sub, email, user_metadata } = data.claims;
  return { id: sub, email, user_metadata: user_metadata ?? {} };
});

// The gate every server action shares: resolve the signed-in user (its token
// already validated by middleware) and hand back a client bound to their
// session. Throws when there's no user so callers can assume one.
export async function requireUser() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}
