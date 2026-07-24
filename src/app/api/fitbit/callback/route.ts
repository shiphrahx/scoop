import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCode } from "@/lib/fitbit";
import { syncActivityDays } from "@/lib/activity-sync";
import { logError } from "@/lib/log";

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

  // Pull the last week straight away so the dashboard's steps / sleep / exercise
  // charts fill in on the first visit, instead of staying empty until the
  // nightly cron runs. Best-effort: a fetch hiccup here shouldn't fail the
  // connect — the cron will catch up.
  try {
    await syncActivityDays(supabase, user.id, tokens.access_token);
  } catch (err) {
    logError(`initial fitbit sync for user ${user.id}`, err);
  }

  const res = NextResponse.redirect(`${origin}/me?fitbit=connected`);
  res.cookies.delete("fitbit_oauth_state");
  return res;
}
