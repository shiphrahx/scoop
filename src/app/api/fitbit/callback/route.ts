import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCode } from "@/lib/fitbit";

// GET /api/fitbit/callback — Fitbit sends the user back here with a one-time
// code. We verify the CSRF state, trade the code for tokens, and save them.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const cookieState = request.cookies.get("fitbit_oauth_state")?.value;

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/me?fitbit=${reason}`);

  if (params.get("error")) return fail("denied");
  if (!code || !state || state !== cookieState) return fail("error");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  let tokens;
  try {
    tokens = await exchangeCode(code, origin);
  } catch {
    return fail("error");
  }

  const { error } = await supabase.from("fitbit_tokens").upsert(
    {
      user_id: user.id,
      access_token: encryptSecret(tokens.access_token),
      refresh_token: encryptSecret(tokens.refresh_token),
      expires_at: tokens.expires_at,
      scope: tokens.scope,
      fitbit_user_id: tokens.fitbit_user_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return fail("error");

  const res = NextResponse.redirect(`${origin}/me?fitbit=connected`);
  res.cookies.delete("fitbit_oauth_state");
  return res;
}
