import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { logError } from "@/lib/log";
import { getDay, refreshTokens, type FitbitTokens } from "@/lib/fitbit";

// GET /api/cron/fitbit — scheduled pull of the last 7 days of Fitbit data for
// every connected user, so activity stays fresh without anyone opening the app.
// No user session; authenticated with CRON_SECRET (Vercel Cron sends it as a
// Bearer token). Uses the service-role client to read tokens and write activity.

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("fitbit_tokens")
    .select("user_id, access_token, refresh_token, expires_at");
  const rows =
    (data as (Pick<
      FitbitTokens,
      "access_token" | "refresh_token" | "expires_at"
    > & { user_id: string })[]) ?? [];

  let synced = 0;
  const now = Date.now();

  for (const t of rows) {
    try {
      let accessToken = decryptSecret(t.access_token);
      if (new Date(t.expires_at).getTime() <= now + 60_000) {
        const fresh = await refreshTokens(decryptSecret(t.refresh_token));
        accessToken = fresh.access_token;
        await supabase
          .from("fitbit_tokens")
          .update({
            access_token: encryptSecret(fresh.access_token),
            refresh_token: encryptSecret(fresh.refresh_token),
            expires_at: fresh.expires_at,
            scope: fresh.scope,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", t.user_id);
      }

      const days = await Promise.all(
        Array.from({ length: 7 }, (_, i) =>
          getDay(accessToken, isoDay(new Date(now - i * DAY_MS))),
        ),
      );
      const activityRows = days.map((d) => ({
        user_id: t.user_id,
        date: d.date,
        steps: d.steps,
        workout_kcal: d.workout_kcal,
        sleep_hours: d.sleep_hours,
        source: "fitbit",
        updated_at: new Date().toISOString(),
      }));
      await supabase
        .from("activity")
        .upsert(activityRows, { onConflict: "user_id,date" });
      synced++;
    } catch (err) {
      // One user's failure shouldn't stop the rest — but log it so a broken
      // sync (revoked token, Fitbit outage) is visible rather than silent.
      logError(`cron fitbit sync for user ${t.user_id}`, err);
      continue;
    }
  }

  return NextResponse.json({ ok: true, users: rows.length, synced });
}
