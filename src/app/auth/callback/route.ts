import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges the OAuth code for a session, then redirects into the app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // The provider bounces back here with an error when the OAuth request itself
  // failed (e.g. redirect URL not whitelisted). Surface it instead of hiding it.
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocal = process.env.NODE_ENV === "development";
      if (isLocal) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
    return NextResponse.redirect(
      `${origin}/login?error=auth&reason=${encodeURIComponent(error.message)}`,
    );
  }

  const reason = providerError ?? "no_code";
  return NextResponse.redirect(
    `${origin}/login?error=auth&reason=${encodeURIComponent(reason)}`,
  );
}
