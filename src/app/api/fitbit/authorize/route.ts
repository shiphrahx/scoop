import { NextResponse, type NextRequest } from "next/server";
import { activeProvider, authorizeUrl, providerConfigured } from "@/lib/fitbit";
import { logError } from "@/lib/log";

// GET /api/fitbit/authorize, kicks off the Fitbit OAuth flow. The user is
// already signed in (middleware guards this route), so we just mint a CSRF
// state, stash it in a short-lived cookie, and bounce them to Fitbit.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  // authorizeUrl throws when the live provider's credentials are missing, and
  // nothing here caught it, so a deployment without them answered this route
  // with a bare 500 ("this page isn't working"), which names neither the setting
  // nor the fact that a setting is what's wrong. Send the user back with a
  // reason and put the detail in the server log.
  if (!providerConfigured()) {
    logError(
      "fitbit authorize",
      new Error(`${activeProvider()} provider has no client credentials configured`),
    );
    return NextResponse.redirect(`${origin}/me?fitbit=config`);
  }

  const state = crypto.randomUUID();

  const res = NextResponse.redirect(authorizeUrl(origin, state));
  res.cookies.set("fitbit_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes to complete the grant
  });
  return res;
}
