import { NextResponse } from "next/server";
import { createRouteClient, safeNext, siteOrigin } from "@/lib/supabase/route";

// Starts the Google sign-in flow.
//
// This runs on the server on purpose. PKCE writes a code verifier before the
// browser leaves for Google and reads it back at /auth/callback. Starting the
// flow from client JS put that verifier in whatever browsing context the button
// was tapped in, and the trip through Google often ends in a different one:
// the installed app hands the Google page to the system browser, and an
// apex/www mismatch changes the host the cookie was scoped to. The verifier was
// then gone on the way back ("PKCE code verifier not found in storage").
// Written here it is an HttpOnly cookie on the exact origin that will receive
// the callback.
export async function GET(request: Request) {
  const origin = siteOrigin(request);
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const { supabase, applyCookies } = await createRouteClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      // We redirect ourselves, so the verifier cookie rides along on the
      // same response that sends the browser to Google.
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    const reason = error?.message ?? "Could not start sign-in.";
    return NextResponse.redirect(
      `${origin}/login?error=auth&reason=${encodeURIComponent(reason)}`,
    );
  }

  return applyCookies(NextResponse.redirect(data.url));
}
