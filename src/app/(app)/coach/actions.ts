"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { encryptSecret, decryptSecret, hashToken } from "@/lib/crypto";
import { updateCalibration } from "@/lib/coach";
import { getCoachData } from "@/lib/queries";
import { getTimezone } from "@/lib/queries";
import { localWeekStart } from "@/lib/time";
import { getDay, refreshTokens, type FitbitTokens } from "@/lib/fitbit";

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Write the reviewed target as NEXT week's daily_targets, so it takes effect
// from Monday. review.macros equals the current target when nothing changed,
// which keeps the week-to-week chain unbroken.
// Run the weekly review without anyone pressing anything.
//
// The whole adaptive loop used to hang off a button. Skip a week and next
// week's target never got written, which broke the chain the review counts back
// through to decide how long a target has been in force. A coach that only
// adjusts when the user remembers to ask it to isn't adjusting.
//
// Idempotent: if next week's row already says what this review says, it does
// nothing, so it is safe to call on every app open.
export async function ensureReviewApplied(): Promise<boolean> {
  const { supabase, user } = await requireUser();
  const { review, phase } = await getCoachData();
  if (review.macros.kcal <= 0) return false;

  const nextWeek = localWeekStart(await getTimezone(), new Date(Date.now() + 7 * DAY_MS));
  const { data: existing } = await supabase
    .from("daily_targets")
    .select("kcal, phase")
    .eq("user_id", user.id)
    .eq("week_start", nextWeek)
    .maybeSingle();

  const row = existing as { kcal: number; phase: string | null } | null;
  if (
    row &&
    Math.round(Number(row.kcal)) === Math.round(review.macros.kcal) &&
    (row.phase ?? "deficit") === phase
  ) {
    return false; // already up to date
  }

  await applyReview();
  return true;
}

export async function applyReview() {
  const { supabase, user } = await requireUser();
  const { review, observed, calibration, predictedTdee, phase } = await getCoachData();
  if (review.macros.kcal <= 0) throw new Error("No target to apply yet.");

  const nextWeek = localWeekStart(await getTimezone(), new Date(Date.now() + 7 * DAY_MS));
  // The phase rides along with the target: next week's review counts back
  // through these rows to know how long the user has been in a deficit.
  const { error } = await supabase.from("daily_targets").upsert(
    { user_id: user.id, week_start: nextWeek, phase, ...review.macros },
    { onConflict: "user_id,week_start" },
  );
  if (error) throw new Error(error.message);

  // Fold this review's measurement into the standing correction. This is the
  // part that makes the coach learn rather than re-guess: next week's target is
  // built on what this user demonstrably burns, and it survives profile edits.
  if (observed && predictedTdee != null && predictedTdee > 0) {
    const next = updateCalibration(calibration, observed.kcalPerDay, predictedTdee);
    await supabase
      .from("users")
      .update({
        tdee_calibration: next,
        tdee_observed_kcal: Math.round(observed.kcalPerDay),
        tdee_observed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
  }

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

  let accessToken = decryptSecret(tokens.access_token);
  // Refresh a minute early to avoid racing the clock.
  if (new Date(tokens.expires_at).getTime() <= Date.now() + 60_000) {
    const fresh = await refreshTokens(decryptSecret(tokens.refresh_token));
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

// --- Sample data (stand-in until Fitbit/Apple are wired up) -----------------
// Seeds the last 2 weeks of activity so the Coach and its weekly review have
// something to chew on. Marked source 'manual' so real device data never
// overwrites it and clearMockActivity() can remove only this.
export async function seedSampleData() {
  const { supabase, user } = await requireUser();
  const now = Date.now();
  const stamp = new Date().toISOString();
  const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

  const activityRows = Array.from({ length: 14 }, (_, i) => ({
    user_id: user.id,
    date: isoDay(new Date(now - i * DAY_MS)),
    steps: Math.round(rand(5500, 12500)),
    workout_kcal: Math.round(rand(120, 520)),
    sleep_hours: Math.round(rand(5.8, 8.2) * 10) / 10,
    source: "manual",
    updated_at: stamp,
  }));
  const { error: aErr } = await supabase
    .from("activity")
    .upsert(activityRows, { onConflict: "user_id,date" });
  if (aErr) throw new Error(aErr.message);

  // A gentle downward weight trend (today lightest) so the review has a real
  // this-week-vs-last-week comparison. ignoreDuplicates protects real weigh-ins.
  const base = 82;
  const weightRows = Array.from({ length: 14 }, (_, i) => ({
    user_id: user.id,
    date: isoDay(new Date(now - i * DAY_MS)),
    weight_kg: Math.round((base + i * 0.12 + rand(-0.2, 0.2)) * 10) / 10,
  }));
  await supabase
    .from("weights")
    .upsert(weightRows, { onConflict: "user_id,date", ignoreDuplicates: true });

  // Two waist points 13 days apart so the "scale flat, waist down" path is
  // demoable too. Also non-destructive.
  await supabase.from("measurements").upsert(
    [
      { user_id: user.id, date: isoDay(new Date(now - 13 * DAY_MS)), waist_cm: 90 },
      { user_id: user.id, date: isoDay(new Date(now)), waist_cm: 88.4 },
    ],
    { onConflict: "user_id,date", ignoreDuplicates: true },
  );

  revalidatePath("/coach");
  revalidatePath("/");
}

// Remove only the seeded activity (leaves real device data and weigh-ins).
export async function clearMockActivity() {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("activity")
    .delete()
    .eq("user_id", user.id)
    .eq("source", "manual");
  if (error) throw new Error(error.message);
  revalidatePath("/coach");
}

// Mint (or rotate) the secret token Health Auto Export uses to post data. We
// store the token encrypted (so Settings can re-display it) plus a sha256 hash
// (what the ingest endpoint matches on). The raw token is returned once here.
export async function generateAppleToken(): Promise<string> {
  const { supabase, user } = await requireUser();
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

  const { error } = await supabase
    .from("users")
    .update({
      apple_ingest_token: encryptSecret(token),
      apple_ingest_token_hash: hashToken(token),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/coach");
  return token;
}
