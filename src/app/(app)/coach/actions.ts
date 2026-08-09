"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { encryptSecret, decryptSecret, hashToken } from "@/lib/crypto";
import { getCoachData, getProfile, getTimezone } from "@/lib/queries";
import { localDate, localWeekStart } from "@/lib/time";
import {
  activeProvider,
  providerConfigured,
  refreshTokens,
  type FitbitTokens,
} from "@/lib/fitbit";
import { syncActivityDays } from "@/lib/activity-sync";
import { logError } from "@/lib/log";

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

  // Never change the user's macros without them choosing to. A review that would
  // CHANGE the target is only ever a proposal now — surfaced on the Coach screen
  // with its reason and an Apply button (applyReview). We still auto-write a HELD
  // week (no macro change) below, so the unbroken run of weekly rows the
  // adaptation gate counts back through stays intact without moving anyone's food.
  if (review.changed) return false;

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
  const { review, observed, calibrationForTarget, predictedTdee, phase, takesEffectNow } =
    await getCoachData();
  if (review.macros.kcal <= 0) throw new Error("No target to apply yet.");

  // Ordinary weekly reviews land on next Monday: the week under review has been
  // eaten already. The calibration graduation is the exception — its hold ends
  // mid-week off a timestamp, so its first deficit is written for the week in
  // force (see takesEffectNow in getCoachData) and the planner moves today.
  const tz = await getTimezone();
  const weekStart = takesEffectNow
    ? localWeekStart(tz, new Date())
    : localWeekStart(tz, new Date(Date.now() + 7 * DAY_MS));
  // The day the target starts being eaten, which is what the two-week
  // adaptation gate counts. Next week's target starts on its Monday; one that
  // takes effect now starts today, part-way through the week it is filed under.
  const effectiveFrom = takesEffectNow ? localDate(tz, new Date()) : weekStart;
  // Only the macro numbers come from review.macros — pick them out explicitly.
  // On a HELD review, review.macros IS the current target row, which carries its
  // own week_start and phase; spreading it would overwrite the week we picked
  // (and drag the old phase along) — so the held-week chain never advanced. The
  // phase we write is this review's.
  const m = review.macros;
  const { error } = await supabase.from("daily_targets").upsert(
    {
      user_id: user.id,
      week_start: weekStart,
      effective_from: effectiveFrom,
      phase,
      kcal: m.kcal,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      fiber_g: m.fiber_g,
      sugar_g: m.sugar_g,
      satfat_g: m.satfat_g,
      sodium_mg: m.sodium_mg,
    },
    { onConflict: "user_id,week_start" },
  );
  if (error) throw new Error(error.message);

  // Store the correction this review's target was computed with. This is the
  // part that makes the coach learn rather than re-guess: next week's target is
  // built on what this user demonstrably burns, and it survives profile edits.
  //
  // Taken from the review rather than recomputed here. Recomputing produced a
  // different number from the one the target was built on — a half-step where
  // the graduation takes the measurement in full — so the stored correction and
  // the target disagreed from the moment it was written.
  //
  // Once per review, not once per apply. Each ordinary fold moves the correction
  // halfway to the measurement, so two folds in a day move it three quarters of
  // the way — and since the graduating target is computed FROM that correction,
  // applying twice in a week walked the target down step by step off the same
  // fortnight of data. The measurement itself only changes as new weigh-ins land,
  // so a second fold inside the week adds no information.
  const profile = await getProfile();
  const foldedAt = profile?.tdee_observed_at ? Date.parse(profile.tdee_observed_at) : null;
  const foldedThisWeek = foldedAt != null && Date.now() - foldedAt < 6 * DAY_MS;
  if (observed && predictedTdee != null && predictedTdee > 0 && !foldedThisWeek) {
    const next = calibrationForTarget;
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
  // A graduating target changes what the user is meant to eat TODAY, so every
  // screen built on the in-force target has to be dropped, not just the two the
  // review used to touch. The planner reading a cached maintenance target is
  // exactly how "nothing changed" looked from the outside.
  revalidatePath("/dashboard");
  revalidatePath("/plan/day");
  revalidatePath("/progress");
}

// The outcome of a sync, in words the user can act on.
//
// This deliberately RETURNS rather than throws. Next redacts the message of an
// uncaught server-action error in production ("An error occurred in the Server
// Components render…"), so every real cause — a revoked token, a provider
// outage, a missing env var — reached the user as the same unreadable sentence.
// The causes below are ordinary operating conditions, not crashes, so each one
// gets its own message here and the underlying error is logged for us.
export interface FitbitSyncResult {
  ok: boolean;
  message: string;
  // The stored connection cannot be repaired from here — only the user granting
  // access again will fix it. Telling them so is useless unless they are also
  // given the button, so this drives one (see FitbitButton). Without it the
  // advice was a dead end: the Connect link only ever showed when no token row
  // existed at all, which is exactly not the case when a token has gone bad.
  reconnect?: boolean;
}

// Pull the last 7 days of steps, workout calories and sleep from Fitbit into
// the activity table, refreshing the access token first if it's near expiry.
export async function syncFitbit(): Promise<FitbitSyncResult> {
  const { supabase, user } = await requireUser();

  // Missing credentials threw from inside refreshTokens and were caught below as
  // an expired connection — so a deployment that was never configured told the
  // user to reconnect, over and over, for something reconnecting cannot fix.
  // No `reconnect` flag here: the grant is not the problem.
  if (!providerConfigured()) {
    logError(
      `fitbit sync for user ${user.id}`,
      new Error(`${activeProvider()} provider has no client credentials configured`),
    );
    return {
      ok: false,
      message: "Device syncing is not set up on this deployment yet.",
    };
  }

  const { data } = await supabase
    .from("fitbit_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const tokens = data as Pick<
    FitbitTokens,
    "access_token" | "refresh_token" | "expires_at"
  > | null;
  if (!tokens) return { ok: false, message: "Connect Fitbit first." };

  // Decrypting is a separate failure from refreshing, and lumping them together
  // reported a server-side key problem as "your connection expired", which is
  // not the user's doing and reads as if they had done something wrong.
  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = decryptSecret(tokens.access_token);
    refreshToken = decryptSecret(tokens.refresh_token);
  } catch (err) {
    logError(`fitbit token decrypt for user ${user.id}`, err);
    return {
      ok: false,
      reconnect: true,
      message: "Your saved connection could not be read. Connect again to replace it.",
    };
  }

  // Refresh a minute early to avoid racing the clock.
  if (new Date(tokens.expires_at).getTime() <= Date.now() + 60_000) {
    try {
      const fresh = await refreshTokens(refreshToken);
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
    } catch (err) {
      // Sync renews the token by itself while the refresh token is still good.
      // Once the provider rejects THAT — revoked access, a refresh token already
      // spent, or one issued by the provider we no longer use — there is nothing
      // left here to retry with, and only a fresh grant will do.
      logError(`fitbit token refresh for user ${user.id}`, err);
      return {
        ok: false,
        reconnect: true,
        message: "That connection has expired. Connect again to resume syncing.",
      };
    }
  }

  let result;
  try {
    result = await syncActivityDays(supabase, user.id, accessToken, 7);
  } catch (err) {
    logError(`fitbit sync for user ${user.id}`, err);
    return { ok: false, message: "Could not reach your activity data. Try again shortly." };
  }

  if (result.written === 0) {
    return {
      ok: false,
      message: "No activity came back for the last 7 days. Check the app is syncing on your phone.",
    };
  }

  revalidatePath("/coach");
  revalidatePath("/");
  const d = result.written;
  return { ok: true, message: `Synced ${d} ${d === 1 ? "day" : "days"}.` };
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
