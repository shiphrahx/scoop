import { NextResponse } from "next/server";
import { createRouteClient, safeNext, siteOrigin } from "@/lib/supabase/route";

// Supabase reports a lost or spent PKCE flow in wording aimed at developers.
// The user only needs to know the attempt is dead and a new one works.
function describeError(message: string): string {
  const text = message.toLowerCase();
  if (
    text.includes("code verifier") ||
    text.includes("code challenge") ||
    text.includes("flow state")
  ) {
    return "That sign-in attempt expired or was started somewhere else. Tap Continue with Google to start a fresh one.";
  }
  return message;
}

// Exchanges the OAuth code for a session, then redirects into the app.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = siteOrigin(request);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // The provider bounces back here with an error when the OAuth request itself
  // failed (e.g. redirect URL not whitelisted). Surface it instead of hiding it.
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/login?error=auth&reason=${encodeURIComponent(describeError(reason))}`,
    );

  if (!code) return fail(providerError ?? "no_code");

  const { supabase, applyCookies } = await createRouteClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) {
    return applyCookies(NextResponse.redirect(`${origin}${next}`));
  }

  // A code that already worked fails here too: refreshing this URL, the back
  // button, or a double tap all replay it, and Supabase answers "invalid flow
  // state, no valid flow state found" because the first exchange consumed it.
  // If the cookies already carry a session that is exactly what happened — the
  // user is signed in, so send them in rather than to an error screen.
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    return applyCookies(NextResponse.redirect(`${origin}${next}`));
  }

  return fail(error.message);
}
