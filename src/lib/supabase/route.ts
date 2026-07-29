import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

// Supabase plumbing for the auth Route Handlers.
//
// These two handlers are the only places that both write auth cookies AND
// return a redirect, so they carry the cookies onto that redirect themselves
// instead of relying on a write to the request-scoped cookie jar surviving.
// A dropped cookie here is a failed sign-in: the code verifier on the way out,
// the session on the way back.
export async function createRouteClient() {
  const cookieStore = await cookies();
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  const extraHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, headers) {
          pending.push(...cookiesToSet);
          Object.assign(extraHeaders, headers ?? {});
        },
      },
    },
  );

  // Copies every cookie the client asked for onto the response, plus the
  // no-store headers Supabase hands us — a cached response carrying a
  // Set-Cookie would serve one user's session to the next.
  function applyCookies<T extends NextResponse>(response: T): T {
    for (const { name, value, options } of pending) {
      response.cookies.set(name, value, options);
    }
    for (const [key, value] of Object.entries(extraHeaders)) {
      response.headers.set(key, value);
    }
    response.headers.set("cache-control", "no-store");
    return response;
  }

  return { supabase, applyCookies };
}

// The origin the browser actually used, so the OAuth round trip starts and ends
// on one host. Behind a proxy `request.url` is the internal address; the
// verifier cookie is scoped to the public one.
export function siteOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (!forwardedHost) return new URL(request.url).origin;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${forwardedHost}`;
}

// Where to land after sign-in. Only in-app paths: an attacker-supplied `next`
// would otherwise turn our own callback into an open redirect.
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}
