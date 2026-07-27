import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the auth session on every request and guards protected routes.
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic =
    // The landing page is the public front door for everyone.
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    // Legal pages must be readable before anyone signs in.
    pathname === "/privacy" ||
    pathname === "/terms" ||
    // PWA install files must be reachable without a session.
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    // Health Auto Export posts here with a per-user token, not a session.
    pathname.startsWith("/api/ingest");

  // Public routes need neither the auth gate nor a session refresh, so skip the
  // Supabase round trip entirely. It sat on the critical path of the landing
  // page and every legal/PWA file — the token refresh they don't use still cost
  // a network hop before the response could stream. A signed-in user who then
  // navigates into the app hits a protected route, which refreshes there.
  if (isPublic) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and reading the session — it can
  // log the user out at random.
  //
  // getClaims() verifies the JWT signature locally (no network) when the project
  // uses asymmetric signing keys, falling back to a getUser() call only on legacy
  // symmetric secrets. Either way it still loads the session first, which refreshes
  // an expired or near-expiry token and writes the new cookies via setAll above —
  // so this is a drop-in for the old getUser() call, minus the guaranteed network
  // hop on every request. On mobile that hop gated the whole app's first byte.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
