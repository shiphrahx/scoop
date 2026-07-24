import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  activeProvider,
  getDay,
  probeDay,
  refreshTokens,
  type FitbitTokens,
} from "@/lib/fitbit";

// GET /api/fitbit/debug — diagnostics for a broken sync. Signed-in only, reads
// the caller's OWN token, refreshes if stale, then returns the raw provider
// response for yesterday alongside what getDay parses out of it. This is what
// tells us whether the connection, the endpoints, or the value nesting is the
// problem when the dashboard charts come back empty.
export async function GET() {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("fitbit_tokens")
    .select("access_token, refresh_token, expires_at, scope")
    .eq("user_id", user.id)
    .maybeSingle();
  const tokens = data as
    | (Pick<FitbitTokens, "access_token" | "refresh_token" | "expires_at"> & {
        scope: string | null;
      })
    | null;

  if (!tokens) {
    return NextResponse.json({ error: "no tokens — not connected" }, { status: 404 });
  }

  let accessToken = decryptSecret(tokens.access_token);
  let refreshed = false;
  let refreshError: string | null = null;
  if (new Date(tokens.expires_at).getTime() <= Date.now() + 60_000) {
    try {
      const fresh = await refreshTokens(decryptSecret(tokens.refresh_token));
      accessToken = fresh.access_token;
      refreshed = true;
      await supabase
        .from("fitbit_tokens")
        .update({
          access_token: encryptSecret(fresh.access_token),
          refresh_token: encryptSecret(fresh.refresh_token),
          expires_at: fresh.expires_at,
          scope: fresh.scope,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    } catch (e) {
      refreshError = e instanceof Error ? e.message : String(e);
    }
  }

  // Yesterday — a fully-elapsed day is likelier to hold data than a partial one.
  const date = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const raw = await probeDay(accessToken, date).catch((e) => ({
    _error: e instanceof Error ? e.message : String(e),
  }));
  const parsed = await getDay(accessToken, date).catch((e) => ({
    _error: e instanceof Error ? e.message : String(e),
  }));

  return NextResponse.json({
    provider: activeProvider(),
    date,
    scope: tokens.scope,
    tokenExpiresAt: tokens.expires_at,
    refreshed,
    refreshError,
    parsed,
    raw,
  });
}
