import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl } from "@/lib/fitbit";

// GET /api/fitbit/authorize — kicks off the Fitbit OAuth flow. The user is
// already signed in (middleware guards this route), so we just mint a CSRF
// state, stash it in a short-lived cookie, and bounce them to Fitbit.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
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
