import { NextResponse } from "next/server";
import { createRouteClient, safeNext, siteOrigin } from "@/lib/supabase/route";

// One attempt at recovering a lost flow, then we stop. Short-lived so a failure
// today cannot spend the retry of a sign-in a week from now.
const RETRY_COOKIE = "sc-auth-retry";
const RETRY_MAX_AGE = 120;

// The verifier cookie went out with this browser but did not come back — the
// PKCE half of the flow is missing, so this code can never be exchanged.
function isLostFlow(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("code verifier") ||
    text.includes("code challenge") ||
    text.includes("flow state")
  );
}

// Supabase reports a lost or spent PKCE flow in wording aimed at developers.
// The user only needs to know the attempt is dead and a new one works.
function describeError(message: string): string {
  if (isLostFlow(message)) {
    return "Sign-in did not complete. Tap Continue with Google to try again.";
  }
  return message;
}

function hasRetried(request: Request): boolean {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .some((part) => part.trim().startsWith(`${RETRY_COOKIE}=`));
}

function retryCookie(origin: string, value: string, maxAge: number) {
  return {
    name: RETRY_COOKIE,
    value,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: origin.startsWith("https:"),
    path: "/",
    maxAge,
  };
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

  // Clearing the marker on the way out gives the next sign-in its own retry,
  // whether this one ended in the app or on the error screen.
  const done = (response: NextResponse) => {
    response.cookies.set(retryCookie(origin, "", 0));
    response.headers.set("cache-control", "no-store");
    return response;
  };

  const fail = (reason: string) =>
    done(
      NextResponse.redirect(
        `${origin}/login?error=auth&reason=${encodeURIComponent(describeError(reason))}`,
      ),
    );

  if (!code) return fail(providerError ?? "no_code");

  const { supabase, applyCookies } = await createRouteClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) {
    return done(applyCookies(NextResponse.redirect(`${origin}${next}`)));
  }

  // A code that already worked fails here too: refreshing this URL, the back
  // button, or a double tap all replay it, and Supabase answers "invalid flow
  // state, no valid flow state found" because the first exchange consumed it.
  // If the cookies already carry a session that is exactly what happened — the
  // user is signed in, so send them in rather than to an error screen.
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    return done(applyCookies(NextResponse.redirect(`${origin}${next}`)));
  }

  // Signing in on a device for the first time can lose the verifier on the way
  // out: a home-screen app hands the Google page to the system browser, and the
  // callback lands in that browser with no cookie the app had set. Repeating the
  // same taps then works, because the second attempt starts and finishes in the
  // one place. Do that repeat here instead of asking the user to — restarting
  // the flow from this context puts both halves in the same cookie jar.
  //
  // Exactly once, marked by a cookie: a flow broken for any other reason still
  // reaches the error screen rather than bouncing between here and Google.
  if (isLostFlow(error.message) && !hasRetried(request)) {
    const retry = NextResponse.redirect(
      `${origin}/auth/signin?next=${encodeURIComponent(next)}`,
    );
    retry.cookies.set(retryCookie(origin, "1", RETRY_MAX_AGE));
    // Carries a Set-Cookie, so it must never be held by a CDN and replayed to
    // the next person through — they would arrive with their retry spent.
    retry.headers.set("cache-control", "no-store");
    return retry;
  }

  return fail(error.message);
}
