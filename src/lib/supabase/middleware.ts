import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Whether this request carries a Supabase session at all. Supabase names its
// cookie sb-<project-ref>-auth-token, splitting it into .0/.1 parts when it is
// too big for one cookie, so match on the shape rather than an exact name.
//
// Used to keep the landing page free for people who have never signed in: with
// no such cookie there is provably no session, so there is nothing to look up.
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
}

// Refreshes the auth session on every request and guards protected routes.
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // The landing page is the public front door, but only for people who are not
  // signed in. A visitor with a session is sent to their dashboard below.
  const isLanding = pathname === "/";
  const isPublic =
    isLanding ||
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
  // page and every legal/PWA file, the token refresh they don't use still cost
  // a network hop before the response could stream. A signed-in user who then
  // navigates into the app hits a protected route, which refreshes there.
  //
  // The landing page is the one exception: a signed-in visitor is moved on to
  // their dashboard, so it does have to know who is asking. Only when a session
  // cookie is actually present, though, a first-time visitor still gets the
  // marketing page with no Supabase hop, which is the case that page is for.
  if (isPublic && !(isLanding && hasSessionCookie(request))) {
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
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          // A refreshed token rides on this response. The no-store headers keep
          // any CDN or proxy from handing that Set-Cookie to the next visitor.
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and reading the session, it can
  // log the user out at random.
  //
  // getClaims() verifies the JWT signature locally (no network) when the project
  // uses asymmetric signing keys, falling back to a getUser() call only on legacy
  // symmetric secrets. Either way it still loads the session first, which refreshes
  // an expired or near-expiry token and writes the new cookies via setAll above,
  // so this is a drop-in for the old getUser() call, minus the guaranteed network
  // hop on every request. On mobile that hop gated the whole app's first byte.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  // Opening the app should land on the day's numbers, not the sales pitch. The
  // installed app asks for /dashboard itself (start_url in app/manifest.ts), but
  // that only covers a cold launch of an app installed since that was set, a
  // home-screen icon made before it still opens "/", as does every bookmark,
  // shared link and typed address. Redirecting here catches all of them.
  //
  // This is also why the check sits in the proxy rather than in the page: an
  // access token expires in about an hour, so the common "opened it again the
  // next day" visit arrives with a stale one. Only here can the refreshed
  // cookies be written to the response; a Server Component's cookie writes are
  // discarded, so the page would have read that user as signed out and shown
  // them the marketing page.
  if (isLanding) {
    if (user) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    // A cookie that no longer resolves to anyone: let the landing page render
    // rather than bouncing them to /login, which is not where a signed-out
    // visitor to the front door expects to end up.
    return supabaseResponse;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
