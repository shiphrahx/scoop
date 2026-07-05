"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCoachData } from "@/lib/queries";
import { weekStart } from "@/lib/coach";
import { getDay, refreshTokens, type FitbitTokens } from "@/lib/fitbit";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Write the reviewed target as NEXT week's daily_targets, so it takes effect
// from Monday. review.macros equals the current target when nothing changed,
// which keeps the week-to-week chain unbroken.
export async function applyReview() {
  const { supabase, user } = await requireUser();
  const { review } = await getCoachData();
  if (review.macros.kcal <= 0) throw new Error("No target to apply yet.");

  const nextWeek = weekStart(new Date(Date.now() + 7 * DAY_MS));
  const { error } = await supabase.from("daily_targets").upsert(
    { user_id: user.id, week_start: nextWeek, ...review.macros },
    { onConflict: "user_id,week_start" },
  );
  if (error) throw new Error(error.message);

  revalidatePath("/coach");
  revalidatePath("/");
}

// Pull the last 7 days of steps, workout calories and sleep from Fitbit into
// the activity table, refreshing the access token first if it's near expiry.
export async function syncFitbit() {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("fitbit_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const tokens = data as Pick<
    FitbitTokens,
    "access_token" | "refresh_token" | "expires_at"
  > | null;
  if (!tokens) throw new Error("Connect Fitbit first.");

  let accessToken = tokens.access_token;
  // Refresh a minute early to avoid racing the clock.
  if (new Date(tokens.expires_at).getTime() <= Date.now() + 60_000) {
    const fresh = await refreshTokens(tokens.refresh_token);
    accessToken = fresh.access_token;
    await supabase
      .from("fitbit_tokens")
      .update({
        access_token: fresh.access_token,
        refresh_token: fresh.refresh_token,
        expires_at: fresh.expires_at,
        scope: fresh.scope,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
  }

  const now = Date.now();
  const days = await Promise.all(
    Array.from({ length: 7 }, (_, i) =>
      getDay(accessToken, isoDay(new Date(now - i * DAY_MS))),
    ),
  );

  const rows = days.map((d) => ({
    user_id: user.id,
    date: d.date,
    steps: d.steps,
    workout_kcal: d.workout_kcal,
    sleep_hours: d.sleep_hours,
    source: "fitbit",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("activity")
    .upsert(rows, { onConflict: "user_id,date" });
  if (error) throw new Error(error.message);

  revalidatePath("/coach");
  revalidatePath("/");
}

// Mint (or rotate) the secret token Health Auto Export uses to post data.
export async function generateAppleToken(): Promise<string> {
  const { supabase, user } = await requireUser();
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

  const { error } = await supabase
    .from("users")
    .update({ apple_ingest_token: token, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/coach");
  return token;
}
