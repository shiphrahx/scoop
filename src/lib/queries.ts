import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import {
  CALIBRATION_MAX_DAYS,
  TREND_WINDOW_DAYS,
  ageFromBirthYear,
  average,
  averageActiveKcal,
  adherence as computeAdherence,
  calibrationComplete,
  calibrationDaysRemaining,
  deficitPerDay,
  graduationCalibration,
  inCalibration as computeInCalibration,
  nextPhase,
  observeTdee,
  openingDeficitKcal,
  restingRate,
  stepsFalling,
  tdee,
  trendChange,
  weeklyReview,
  type Adherence,
  type DailyIntake,
  type Phase,
  type ObservedTdee,
  type TrendChange,
  type WeeklyReview,
} from "@/lib/coach";
import {
  calibrationWrap,
  holdDays,
  type CalibrationWrap,
} from "@/lib/calibrationwrap";
import {
  DEFAULT_TIMEZONE,
  dayRangeFor,
  localDate,
  localWeekStart,
  safeTimezone,
  startOfLocalDay,
  weekStartOf,
} from "@/lib/time";
import {
  cycleConfigFrom,
  dayTarget as dayTargetMacros,
  highDaysRemaining,
  refeedCarbUpliftG,
  resolveHighDaysAllowance,
  roundMacros,
  type CycleConfig,
} from "@/lib/highday";
import type {
  CustomMilestone,
  DayIntake,
  WeekTarget,
} from "@/lib/insights";
import type {
  Activity,
  CheckIn,
  CheckInPhoto,
  DailyTargets,
  FreshFood,
  FreshFoodSize,
  LoggedFood,
  Macros,
  NonScaleVictory,
  PlannedMeal,
  Profile,
} from "@/lib/types";

// The timezone the signed-in user lives in, falling back to UTC. Every day
// boundary below is drawn with it: the server's clock is UTC, which is not the
// user's day (see src/lib/time.ts).
// Cached per request: almost every read below draws a day boundary, and each
// one used to re-fetch this. It cannot change while a request is in flight.
export const getTimezone = cache(async function getTimezone(): Promise<string> {
  // Reuse the cached profile instead of a second round trip to the same users
  // row. Almost every request that draws a day boundary also reads the profile
  // (the layout's onboarding gate alone does), so this is free there; where it
  // isn't, it's the same single-row lookup by primary key.
  const profile = await getProfile();
  if (!profile) return DEFAULT_TIMEZONE;

  return safeTimezone(profile.timezone);
});

// Today's date where the user is, as YYYY-MM-DD. Used for the planned_meals.date
// column so a plan lines up with the calendar day they're actually living in.
export async function localToday(): Promise<string> {
  return localDate(await getTimezone());
}

// Server-side reads. Each returns the current user's data (RLS enforces scope).

// Cached per request. The dashboard alone asks for the profile three times
// (the page, the layout's onboarding gate, and the coach data underneath it).
// Nothing writes to the users row and then re-reads it inside one request, so
// there is no staleness to trade for the round trips saved.
export const getProfile = cache(async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
});

// Cached per request: the in-force target is read by both the home ring
// (getHighDayStatus) and the coach underneath it in the same render, and nothing
// writes a target then re-reads it inside one request. One daily_targets round
// trip instead of one per caller.
const TARGET_COLS =
  "week_start, effective_from, phase, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg";

// The calibration row a running hold is pinned to: the earliest one belonging to
// the current run, i.e. not older than the week the hold started. Rows from an
// abandoned earlier run are skipped, restarting calibration after months away
// must measure today's body, not re-apply the target of the one that onboarded.
// Null `startedAt` (or no row at or after it) falls back to the earliest row, which
// is what a user who has only ever calibrated once has anyway.
export function calibrationAnchor(
  rows: DailyTargets[],
  startedAt: string | null,
): DailyTargets | null {
  if (rows.length === 0) return null;
  if (startedAt) {
    const runStart = weekStartOf(startedAt.slice(0, 10));
    const inRun = rows.find((r) => r.week_start >= runStart);
    if (inRun) return inRun;
  }
  return rows[0];
}

export const getCurrentTargets = cache(async function getCurrentTargets(): Promise<DailyTargets | null> {
  const supabase = await createClient();
  const tz = await getTimezone();
  // Two reads, one round trip. The second is only USED while the user is
  // calibrating, but which case applies isn't known until the first comes back,
  // and issuing it afterwards put a second sequential round trip on the home
  // screen for exactly the new users who have the least patience for it. Both
  // are single-row lookups on the (user_id, week_start) index, so speculatively
  // asking for the anchor costs far less than waiting to find out we need it.
  const [latestRes, anchorRes, profile] = await Promise.all([
    // Prefer this week's target; fall back to the most recent one. The week turns
    // over on the user's Monday, not the server's.
    supabase
      .from("daily_targets")
      .select(TARGET_COLS)
      .lte("week_start", localWeekStart(tz))
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // The calibration-phase rows, oldest first. The anchor is the earliest one of
    // the RUN that is in force, not simply the earliest ever, because a user can
    // restart calibration and the original onboarding row would then pin them to a
    // target computed from a body they no longer have. A handful of rows is plenty:
    // a run is a fortnight, so at most three weeks belong to it.
    supabase
      .from("daily_targets")
      .select(TARGET_COLS)
      .eq("phase", "calibration")
      .order("week_start", { ascending: true })
      .limit(12),
    // Cached per request, and needed here only to date the run in force.
    getProfile(),
  ]);

  const latest = (latestRes.data as DailyTargets) ?? null;

  // During calibration the target is FIXED at the one set when calibration began.
  // If any later row drifted the number up (an older build recomputed it from a
  // moving maintenance estimate), ignore it and return the anchor so the number
  // can't creep and any past creep is undone.
  if (latest?.phase === "calibration") {
    return calibrationAnchor(
      (anchorRes.data as DailyTargets[]) ?? [],
      profile?.calibration_started_at ?? null,
    ) ?? latest;
  }

  return latest;
});

// The refeed picture for one calendar day: whether refeeds are available, whether
// this day is a refeed, the weekly count and how much is left, the extra carbs a
// refeed carries, and the day's actual macro target. One read the planner and the
// home ring both build on. `target` is null only when there's no base target yet
// (onboarding unfinished).
export interface HighDayStatus {
  weekStart: string;
  enabled: boolean;
  isHigh: boolean;
  allowance: number;
  taken: number;
  remaining: number;
  // The carbs a refeed day adds on top of the deficit target (the whole gap up to
  // maintenance). 0 when refeeds aren't available.
  upliftCarbsG: number;
  // The maintenance ceiling a refeed is raised to, for the UI to explain the cap.
  maintenanceKcal: number | null;
  base: DailyTargets | null;
  target: Required<Macros> | null;
}

// The user's best maintenance estimate, calibrated by their own results. This is
// the ceiling a refeed day is raised to; null when we can't estimate it (missing
// stats), which keeps refeeds switched off until we can.
export function maintenanceKcalFor(
  profile: Profile | null,
  weightKg: number | null,
): number | null {
  if (
    profile?.height_cm &&
    profile.sex &&
    profile.birth_year &&
    weightKg != null &&
    weightKg > 0
  ) {
    return Math.round(
      tdee({
        sex: profile.sex,
        diet: profile.diet_type ?? "regular",
        weightKg,
        heightCm: Number(profile.height_cm),
        age: ageFromBirthYear(profile.birth_year),
        activity: profile.activity_level ?? "sedentary",
        bodyFatPct: profile.body_fat_pct,
        goalWeightKg: profile.goal_weight_kg,
        tdeeCalibration: profile.tdee_calibration,
      }),
    );
  }
  return profile?.estimated_maintenance_kcal != null
    ? Number(profile.estimated_maintenance_kcal)
    : null;
}

export async function getHighDayStatus(date: string): Promise<HighDayStatus> {
  const supabase = await createClient();
  // weekStartOf is pure arithmetic on the date we were handed, so the refeed
  // rows can be fetched alongside the profile/target/weight batch instead of
  // waiting behind it. It used to run after, which put a whole extra round trip
  // on the home screen's critical path for a read that depends on none of them.
  const weekStart = weekStartOf(date);
  const [profile, base, weightKg, highDaysRes] = await Promise.all([
    getProfile(),
    getCurrentTargets(),
    getLatestWeight(),
    // Every refeed day the user has taken this week (RLS scopes it to them).
    supabase.from("high_days").select("date").eq("week_start", weekStart),
  ]);

  const highDates = ((highDaysRes.data as { date: string }[]) ?? []).map(
    (r) => r.date,
  );
  const isHigh = highDates.includes(date);

  // Phase rides on the in-force target row, so reading it here needs no recompute.
  const phase: Phase = (base?.phase as Phase | undefined) ?? "deficit";
  const maintenanceKcal = maintenanceKcalFor(profile, weightKg);
  // cycleConfigFrom gates on calibration and on having a maintenance estimate, so
  // refeeds stay off until the deficit is real and maintenance is known.
  const cfg = profile
    ? cycleConfigFrom(profile, phase, maintenanceKcal)
    : { enabled: false, refeedDaysPerWeek: 0, maintenanceKcal: null };
  const allowance = cfg.refeedDaysPerWeek;
  const upliftCarbsG = base ? Math.round(refeedCarbUpliftG(base, cfg)) : 0;

  return {
    weekStart,
    enabled: cfg.enabled,
    isHigh,
    allowance,
    taken: highDates.length,
    remaining: highDaysRemaining(allowance, highDates.length),
    upliftCarbsG,
    maintenanceKcal: cfg.maintenanceKcal,
    base,
    target: base ? roundMacros(dayTargetMacros(base, isHigh, cfg)) : null,
  };
}

// The macro target for one day, respecting cycling: a high or low day when it's
// on, the flat base when it's off. Null before onboarding sets a base target.
export async function getDayTarget(date: string): Promise<Required<Macros> | null> {
  return (await getHighDayStatus(date)).target;
}

export async function getTodayConsumed(): Promise<Macros> {
  return getConsumedForDate(await localToday());
}

// Every food log on one calendar day where the user lives, as raw macro rows.
// Bounded on both ends so a past day stops at its own midnight instead of
// running to now.
//
// Cached per request, and deliberately the one place these rows are read: Home
// both sums them (the calorie ring) and asks whether there are any at all (the
// "plan your day" nudge), which used to be two round trips hitting the same
// rows with the same filter.
const getFoodLogsForDate = cache(async function getFoodLogsForDate(
  date: string,
): Promise<Macros[]> {
  const supabase = await createClient();
  const { start, end } = dayRangeFor(await getTimezone(), date);

  const { data } = await supabase
    .from("food_logs")
    .select("kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg")
    .gte("logged_at", start.toISOString())
    .lt("logged_at", end.toISOString());

  return (data as Macros[]) ?? [];
});

// Food logged on one calendar day where the user lives, summed.
export async function getConsumedForDate(date: string): Promise<Macros> {
  const rows = await getFoodLogsForDate(date);
  return rows.reduce<Required<Macros>>(
    (sum, r) => ({
      kcal: sum.kcal + Number(r.kcal),
      protein_g: sum.protein_g + Number(r.protein_g),
      carbs_g: sum.carbs_g + Number(r.carbs_g),
      fat_g: sum.fat_g + Number(r.fat_g),
      fiber_g: sum.fiber_g + Number(r.fiber_g ?? 0),
      sugar_g: sum.sugar_g + Number(r.sugar_g ?? 0),
      satfat_g: sum.satfat_g + Number(r.satfat_g ?? 0),
      sodium_mg: sum.sodium_mg + Number(r.sodium_mg ?? 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, satfat_g: 0, sodium_mg: 0 },
  );
}

// The day's food logs that no meal in the plan owns: a drink, a serving out of
// a batch, a scanned product, anything logged straight into the day rather
// than by eating a planned meal.
//
// Eating a planned meal writes a food log too and points the meal at it, so
// those are filtered out: the day screen already shows them under their slot,
// and counting them here as well would double the day.
export async function getLoggedExtrasForDate(
  date: string,
): Promise<LoggedFood[]> {
  const supabase = await createClient();
  const { start, end } = dayRangeFor(await getTimezone(), date);

  const [{ data }, { data: planned }] = await Promise.all([
    supabase
      .from("food_logs")
      .select(
        "id, name, source, logged_at, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg",
      )
      .gte("logged_at", start.toISOString())
      .lt("logged_at", end.toISOString())
      .order("logged_at", { ascending: true }),
    supabase
      .from("planned_meals")
      .select("logged_food_id")
      .eq("date", date)
      .not("logged_food_id", "is", null),
  ]);

  const eatenFromPlan = new Set(
    ((planned as { logged_food_id: string }[]) ?? []).map(
      (p) => p.logged_food_id,
    ),
  );

  return ((data as LoggedFood[]) ?? [])
    .filter((row) => !eatenFromPlan.has(row.id))
    .map((row) => ({
      ...row,
      kcal: Number(row.kcal),
      protein_g: Number(row.protein_g),
      carbs_g: Number(row.carbs_g),
      fat_g: Number(row.fat_g),
      fiber_g: Number(row.fiber_g ?? 0),
      sugar_g: Number(row.sugar_g ?? 0),
      satfat_g: Number(row.satfat_g ?? 0),
      sodium_mg: Number(row.sodium_mg ?? 0),
    }));
}

// Today's saved day plan (all slots), ordered as the user arranged them.
export async function getTodayPlan(): Promise<PlannedMeal[]> {
  return getPlanForDate(await localToday());
}

// One calendar day's saved plan (all slots), ordered as the user arranged them.
export async function getPlanForDate(date: string): Promise<PlannedMeal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("planned_meals")
    .select(
      "id, date, slot, position, origin, name, items, picks, portions, swaps, why, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg, logged_food_id",
    )
    .eq("date", date)
    .order("position", { ascending: true });

  return ((data as PlannedMeal[]) ?? []).map((m) => ({
    ...m,
    picks: m.picks ?? [],
    kcal: Number(m.kcal),
    protein_g: Number(m.protein_g),
    carbs_g: Number(m.carbs_g),
    fat_g: Number(m.fat_g),
    fiber_g: Number(m.fiber_g ?? 0),
    sugar_g: Number(m.sugar_g ?? 0),
    satfat_g: Number(m.satfat_g ?? 0),
    sodium_mg: Number(m.sodium_mg ?? 0),
  }));
}

// True once the user has logged any food today, used to decide whether to
// nudge them to plan the day. Reads the same cached rows the calorie ring sums,
// so on Home this is free rather than its own count query.
export async function hasTrackedToday(): Promise<boolean> {
  return (await getFoodLogsForDate(await localToday())).length > 0;
}

// The two secrets stored on the users row. getProfile selects the whole row, so
// they are already in hand, but they are deliberately absent from the Profile
// type, so nothing can pass them to a client component by accident. This reads
// them back through a local cast at the one or two places that legitimately
// need them, on the server.
type UserSecrets = {
  anthropic_api_key?: string | null;
  apple_ingest_token?: string | null;
};
const secretsOf = (profile: Profile | null): UserSecrets =>
  (profile as (Profile & UserSecrets) | null) ?? {};

// True when the user has saved an Anthropic key (the key itself never leaves
// the server, we only report whether one exists).
//
// Read off the cached profile rather than its own query: every screen that asks
// this (/plan, /plan/recipe, /pantry/add, /me) already has the profile loaded
// for the same request, so this used to be a second round trip to the same row.
export async function hasApiKey(): Promise<boolean> {
  return Boolean(secretsOf(await getProfile()).anthropic_api_key);
}

// The user's Apple ingest token in the clear, for showing them the URL Health
// Auto Export should post to. Null when they've never generated one. Same story
// as hasApiKey: it rides on the profile row the request already holds.
export async function getAppleIngestToken(): Promise<string | null> {
  const stored = secretsOf(await getProfile()).apple_ingest_token;
  return stored ? decryptSecret(stored) : null;
}

// Everything the Coach page needs: the weekly review plus the raw numbers and
// connection state behind it. Also used by the "apply" action so the target it
// writes is computed from the same rules the page showed.
export interface CoachData {
  review: WeeklyReview;
  // The target in force, with the week and phase it belongs to, the apply
  // action needs both to decide which week it is writing.
  current: DailyTargets | null;
  // Movement of the smoothed trend weight over the last week, and where that
  // trend sits today. Null when there aren't enough weigh-ins to span a week.
  trend: TrendChange | null;
  trendWeightKg: number | null;
  waistDeltaCm: number | null;
  // What the user's own numbers say they burn, and the running correction to
  // the formula that it feeds. Null when the data can't support a measurement.
  observed: ObservedTdee | null;
  calibration: number;
  // The correction this review's target was computed with, the stored one for
  // an ordinary week, the measurement-led one on the way out of calibration.
  // Applying the review stores THIS, rather than recomputing and risking a
  // different number from the one the target was built on.
  calibrationForTarget: number;
  // How closely the user ate this week's target. The review will not cut on a
  // stall the user never actually tested.
  adherence: Adherence | null;
  // Calibration, deficit, a planned diet break, or maintenance at the goal.
  phase: Phase;
  // Whether the new-user calibration hold is running, and roughly how many days
  // are left in it. estimatedMaintenanceKcal is what we're calibrating from,
  // shown on the progress screen before any measurement exists.
  calibrationActive: boolean;
  calibrationDaysRemaining: number;
  // Whether applying this review changes THIS week's target rather than next
  // week's. True only for the calibration→deficit graduation: see applyReview.
  takesEffectNow: boolean;
  estimatedMaintenanceKcal: number | null;
  // The maintenance figure this review's target was actually built from: the
  // formula's prediction times the correction in force (including, on the way
  // out of calibration, the measurement the hold just produced). Null when the
  // profile can't support a prediction.
  maintenanceKcal: number | null;
  // The formula's maintenance estimate with NO calibration applied. The
  // correction is the ratio of the measurement to this raw prediction, measure
  // it against an already-corrected number and the ratio sits at 1 for ever and
  // never converges on anything. Null when the profile is too incomplete.
  predictedTdee: number | null;
  activity: Activity[];
  fitbitConnected: boolean;
  appleIngestToken: string | null;
}

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// How far back a waist measurement can be and still count as "the previous
// one" for the weekly review.
const WAIST_WINDOW_DAYS = 28;

// Calories logged per local day over a window, one entry per day that has any
// food on it. Days with nothing logged are absent rather than zero: a day the
// user didn't log is unknown, not a fast, and scoring it as zero would drag the
// measured intake down and the measured burn with it.
export async function getDailyIntake(
  tz: string,
  windowDays: number,
  now = new Date(),
): Promise<DailyIntake[]> {
  const supabase = await createClient();
  const from = startOfLocalDay(
    tz,
    new Date(now.getTime() - (windowDays - 1) * DAY_MS),
  );

  const { data } = await supabase
    .from("food_logs")
    .select("logged_at, kcal")
    .gte("logged_at", from.toISOString());

  const byDay = new Map<string, number>();
  for (const row of (data as { logged_at: string; kcal: number }[]) ?? []) {
    const day = localDate(tz, new Date(row.logged_at));
    byDay.set(day, (byDay.get(day) ?? 0) + Number(row.kcal));
  }

  return [...byDay.entries()]
    .map(([date, kcal]) => ({ date, kcal }))
    .filter((d) => d.kcal > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Cached per request: the home page now streams the coach headline and the
// calibration banner as two separate slots, and both call this. Deduped to one
// computation (and one set of DB reads) per render.
export const getCoachData = cache(async function getCoachData(): Promise<CoachData> {
  const supabase = await createClient();
  const user = await getSessionUser();

  const now = new Date();
  const tz = await getTimezone();
  // The weeks the review compares are the user's weeks: both cut-offs and the
  // week boundary are drawn in their zone, or a weigh-in near midnight lands in
  // the wrong week and skews the average the coach acts on.
  const cutDay = (daysBack: number) =>
    localDate(tz, new Date(now.getTime() - daysBack * DAY_MS));
  const cut7 = cutDay(6); // last 7 days incl today
  const cut14 = cutDay(13);
  // The trend filter reads a month of weigh-ins. It only needs a week's worth to
  // report a rate, but the extra history is what makes the rate steady.
  const cutTrend = cutDay(TREND_WINDOW_DAYS - 1);
  // The waist gate can only speak for the week under review. Unbounded, the
  // "previous" tape reading could be from months ago, and a long-since-earned
  // -4 cm would read as this week's progress and hold a genuine plateau open
  // for ever. Measurements are weekly, so a month covers a real pair.
  const cutWaist = cutDay(WAIST_WINDOW_DAYS - 1);

  // Everything the review reads is fetched in one parallel batch. None of these
  // depend on each other's results, the cut-offs and the week boundary are all
  // derived from `tz`/`now` up front, so the daily intake (a 28-day food_logs
  // scan) and the weekly-target history join the batch rather than each adding a
  // sequential round trip after it. Home waits on one Supabase round trip here,
  // not three.
  const thisWeekStart = localWeekStart(tz, now);
  const [
    profile,
    current,
    weightsRes,
    measRes,
    activityRes,
    fitbitRes,
    intake,
    histRes,
  ] = await Promise.all([
      getProfile(),
      getCurrentTargets(),
      supabase
        .from("weights")
        .select("date, weight_kg")
        .gte("date", cutTrend)
        .order("date", { ascending: false }),
      supabase
        .from("check_ins")
        .select("date, waist_cm")
        .not("waist_cm", "is", null)
        .gte("date", cutWaist)
        .order("date", { ascending: false })
        .limit(2),
      supabase
        .from("activity")
        .select("date, steps, workout_kcal, sleep_hours, source")
        .gte("date", cut14)
        .order("date", { ascending: false })
        .limit(14),
      user
        ? supabase.from("fitbit_tokens").select("user_id").eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      // No separate read for the Apple token: it lives on the users row that
      // `profile` above already carries.
      getDailyIntake(tz, TREND_WINDOW_DAYS, now),
      supabase
        .from("daily_targets")
        .select("week_start, effective_from, kcal, phase")
        .lte("week_start", thisWeekStart)
        .order("week_start", { ascending: false })
        .limit(26),
    ]);

  const weights = (weightsRes.data as { date: string; weight_kg: number }[]) ?? [];
  const trend = trendChange(
    weights.map((w) => ({ date: w.date, kg: Number(w.weight_kg) })),
  );

  const meas = (measRes.data as { waist_cm: number }[]) ?? [];
  const waistDeltaCm =
    meas.length >= 2 ? Number(meas[0].waist_cm) - Number(meas[1].waist_cm) : null;

  // What the user's own numbers say they burn. This is the measurement that
  // outranks the formula: intake against the slope of their weight. `intake` is
  // fetched in the batch above.
  const weighIns = weights.map((w) => ({ date: w.date, kg: Number(w.weight_kg) }));
  const observed = observeTdee(weighIns, intake);
  const adherence = current ? computeAdherence(intake, current.kcal) : null;
  const calibration =
    profile?.tdee_calibration != null && profile.tdee_calibration > 0
      ? Number(profile.tdee_calibration)
      : 1;

  const activityRows = (activityRes.data as Activity[]) ?? [];
  // This user's own resting metabolism, which sets their real calorie floor.
  const restingRateKcal =
    profile?.height_cm && profile.sex && profile.birth_year && (trend?.nowKg ?? null)
      ? restingRate({
          sex: profile.sex,
          weightKg: trend!.nowKg,
          heightCm: Number(profile.height_cm),
          age: ageFromBirthYear(profile.birth_year),
          bodyFatPct: profile.body_fat_pct,
        })
      : null;
  const thisWeekActivity = activityRows.filter((a) => a.date >= cut7);
  const lastWeekActivity = activityRows.filter((a) => a.date >= cut14 && a.date < cut7);
  const stepsDropped = stepsFalling(
    thisWeekActivity.map((a) => a.steps),
    lastWeekActivity.map((a) => a.steps),
  );
  const stepsPerDay = average(
    thisWeekActivity.map((a) => a.steps).filter((s): s is number => s != null && s > 0),
  );
  const latestKg = trend?.nowKg ?? (weighIns.length ? weighIns[0].kg : null);
  const predictedTdee =
    profile?.height_cm && profile.sex && profile.birth_year && latestKg
      ? tdee({
          sex: profile.sex,
          diet: profile.diet_type ?? "regular",
          weightKg: latestKg,
          heightCm: Number(profile.height_cm),
          age: ageFromBirthYear(profile.birth_year),
          activity: profile.activity_level ?? "sedentary",
          bodyFatPct: profile.body_fat_pct,
          activeKcalPerDay: averageActiveKcal(
            thisWeekActivity.map((a) => a.workout_kcal),
            7,
          ),
          stepsPerDay,
          tdeeCalibration: 1, // deliberately raw, see predictedTdee above
        })
      : null;

  // Consistency gate: the trend can produce a number from very little, but a
  // number built on two weigh-ins a fortnight apart isn't one to change someone's
  // food over. Ask for a real cadence at both ends of the comparison window.
  const MIN_WEIGH_INS = 3;
  const inLastWeek = weights.filter((w) => w.date >= cut7).length;
  const inWeekBefore = weights.filter((w) => w.date >= cut14 && w.date < cut7).length;
  const consistent = inLastWeek >= MIN_WEIGH_INS && inWeekBefore >= MIN_WEIGH_INS;

  // Adaptation gate: how many DAYS the current calorie target has actually been
  // in force. The review won't cut or add until the body has had a full two
  // weeks to respond. We walk back through the unbroken run of same-kcal weekly
  // rows and count from the day the earliest of them started being eaten,
  // effective_from, which is the Monday for an ordinary weekly target but the
  // day itself for one written mid-week (a calibration graduation, a profile
  // edit). Counting calendar weeks handed a target that began on the Thursday
  // credit for the four days before it existed. The history was fetched in the
  // batch above; it's only meaningful once there's a current target.
  const targetHistory = current
    ? ((histRes.data as
        | {
            week_start: string;
            effective_from: string | null;
            kcal: number;
            phase: string | null;
          }[]
        | null) ?? [])
    : [];
  let daysOnTarget = 0;
  if (current) {
    const today = localDate(tz, now);
    let startedOn = thisWeekStart;
    for (const row of targetHistory) {
      if (Math.round(Number(row.kcal)) === Math.round(current.kcal)) {
        startedOn = row.effective_from ?? row.week_start;
      } else {
        break;
      }
    }
    daysOnTarget = Math.max(
      0,
      Math.round((Date.parse(today) - Date.parse(startedOn)) / DAY_MS),
    );
  }

  // How long the user has been in each state, counted back through the stored
  // weekly targets. This is what tells the coach a diet break is due.
  const countRun = (want: Phase) => {
    let n = 0;
    for (const row of targetHistory) {
      if ((row.phase ?? "deficit") === want) n++;
      else break;
    }
    return n;
  };
  // Calibration: a new user's first ~2 weeks eating at maintenance while the app
  // learns their real burn. The window is driven off a timestamp on the user
  // (not the weekly cadence) because it's shorter than a phase-per-week can
  // measure; graduation needs a trustworthy measurement (observed) or the max
  // window to have elapsed.
  const calStartedAt = profile?.calibration_started_at ?? null;
  const calState = { startedAt: calStartedAt, now, observed };
  const calActive = computeInCalibration(calState);
  const calComplete = calibrationComplete(calState);
  const calDaysRemaining = calibrationDaysRemaining(calState);

  const phase = nextPhase({
    weeksInDeficit: countRun("deficit"),
    weeksInBreak: countRun("diet_break"),
    currentWeightKg: trend?.nowKg ?? latestKg ?? 0,
    goalWeightKg: profile?.goal_weight_kg,
    inCalibration: calActive,
    calibrationComplete: calComplete,
  });

  // The phase the in-force target belongs to, lets the review notice the
  // calibration→deficit transition and open a fresh, modest cut.
  const prevPhase: Phase = (current?.phase as Phase | undefined) ?? "deficit";

  // The modest deficit to OPEN the cut with when leaving calibration: the
  // pace-derived deficit, clamped into a sustainable 300 to 500 kcal/day band.
  const openingDeficit =
    profile?.goal_pace && latestKg
      ? openingDeficitKcal(
          deficitPerDay(
            profile.goal_pace,
            latestKg,
            profile.body_fat_pct,
            profile.sex ?? "female",
          ),
        )
      : null;

  // The correction the user's maintenance is figured from.
  //
  // On the way out of calibration this has to include the measurement the hold
  // just produced. The stored factor is only folded in applyReview, moments
  // AFTER this target is computed, so the first deficit, the whole point of the
  // fortnight, was being cut from the formula's own guess, with the fortnight's
  // evidence not arriving until the following review. It also made the message
  // untrue: it named a "measured maintenance" the target had not been built on.
  // Fold here with the same call applyReview will make, so the number shown, the
  // target written and the correction stored all agree.
  const graduating = prevPhase === "calibration" && phase !== "calibration";
  const calibrationForTarget =
    graduating && observed && predictedTdee != null && predictedTdee > 0
      ? graduationCalibration(calibration, observed.kcalPerDay, predictedTdee)
      : calibration;
  const maintenanceKcal =
    predictedTdee != null ? Math.round(predictedTdee * calibrationForTarget) : null;

  const sex = profile?.sex ?? "female";
  const review = current
    ? weeklyReview({
        sex,
        diet: profile?.diet_type ?? "regular",
        trend,
        waistDeltaCm,
        current,
        // Keep the protein cap consistent with onboarding when we recompute.
        heightCm: profile?.height_cm,
        goalWeightKg: profile?.goal_weight_kg,
        // Cadence gates, hold unless the target has been eaten for a full two
        // weeks and the weigh-ins are consistent.
        daysOnTarget,
        consistent,
        adherence: adherence ?? undefined,
        stepsDropped,
        bodyFatPct: profile?.body_fat_pct,
        restingRateKcal,
        phase,
        prevPhase,
        // Opening deficit + a fallback weight, for the calibration→deficit
        // transition (a just-graduated user may still have a thin trend).
        deficitKcal: openingDeficit,
        weightKg: latestKg,
        calibrationDaysRemaining: calDaysRemaining,
        // The user's real maintenance, calibrated. Passed in so holding at
        // maintenance never has to be back-derived from the target in force.
        maintenanceKcal,
      })
    : {
        macros: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
        changed: false,
        changeKg: null,
        changePct: null,
        headline: "Finish onboarding",
        detail: "Set up your profile so I can work out your targets.",
      };

  return {
    review,
    current,
    trend,
    trendWeightKg: trend?.nowKg ?? null,
    waistDeltaCm,
    observed,
    calibration,
    calibrationForTarget,
    adherence,
    predictedTdee,
    phase,
    calibrationActive: phase === "calibration",
    calibrationDaysRemaining: calDaysRemaining,
    // The calibration hold ends on its own timestamp, part-way through a week,
    // not on a Monday. Writing its first deficit as NEXT week's target left the
    // user eating maintenance for up to six more days after being told the cut
    // had started, and left this week's row still phase "calibration", so every
    // reload re-proposed the same transition off a maintenance estimate that had
    // moved in the meantime, each apply landing lower than the last. The
    // graduating target belongs to the week in force.
    takesEffectNow: review.changed && prevPhase === "calibration" && phase !== "calibration",
    maintenanceKcal,
    estimatedMaintenanceKcal:
      profile?.estimated_maintenance_kcal != null
        ? Number(profile.estimated_maintenance_kcal)
        : predictedTdee != null
          ? Math.round(predictedTdee * calibration)
          : null,
    activity: activityRows,
    fitbitConnected: Boolean((fitbitRes.data as { user_id: string } | null)?.user_id),
    appleIngestToken: (() => {
      const stored = secretsOf(profile).apple_ingest_token;
      return stored ? decryptSecret(stored) : null;
    })(),
  };
});

// One filed calibration review: the findings exactly as the user was shown them
// when they started that deficit.
export interface FiledCalibrationReview {
  id: string;
  startedAt: string;
  endedAt: string;
  days: number;
  findings: CalibrationWrap;
}

function toFiledReview(r: Record<string, unknown>): FiledCalibrationReview {
  return {
    id: r.id as string,
    startedAt: r.started_at as string,
    endedAt: r.ended_at as string,
    days: Number(r.days ?? 0),
    findings: r.findings as CalibrationWrap,
  };
}

// Every calibration review this user has been shown, newest first. Usually one;
// more for someone who has restarted calibration after a long break.
export async function getCalibrationReviews(): Promise<FiledCalibrationReview[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calibration_reviews")
    .select("id, started_at, ended_at, days, findings")
    .order("ended_at", { ascending: false });
  return ((data as Record<string, unknown>[]) ?? []).map(toFiledReview);
}

// One filed review by id, for re-watching it. Null when it isn't there, which
// includes another user's review, since RLS filters it out rather than erroring.
export async function getCalibrationReview(
  id: string,
): Promise<FiledCalibrationReview | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calibration_reviews")
    .select("id, started_at, ended_at, days, findings")
    .eq("id", id)
    .maybeSingle();
  return data ? toFiledReview(data as Record<string, unknown>) : null;
}

// The calibration review, or null when there isn't one to show.
//
// There is exactly one moment this returns anything: the hold has ended, a first
// deficit is waiting, and the user has not started it yet (takesEffectNow, which
// goes false the instant the graduating target is written). So the screen is its
// own gate, no "seen" flag to keep in step, and closing the tab without
// starting leaves the review exactly where it was.
export const getCalibrationWrap = cache(async function getCalibrationWrap(): Promise<CalibrationWrap | null> {
  const [coach, profile, tz] = await Promise.all([
    getCoachData(),
    getProfile(),
    getTimezone(),
  ]);
  const startedAt = profile?.calibration_started_at ?? null;
  if (!coach.takesEffectNow || !startedAt || !coach.current) return null;

  // Read back far enough to cover the whole hold whatever length it ran, with a
  // little slack for a user who left the app open past the end of it.
  const days = Math.min(90, Math.max(CALIBRATION_MAX_DAYS, holdDays(startedAt, new Date())) + 7);
  const [weights, intake] = await Promise.all([
    getWeightHistory(days),
    getDailyIntake(tz, days),
  ]);

  const weightKg = coach.trendWeightKg ?? (weights.length ? weights[weights.length - 1].weight_kg : null);
  const restingRateKcal =
    profile?.height_cm && profile.sex && profile.birth_year && weightKg
      ? restingRate({
          sex: profile.sex,
          weightKg,
          heightCm: Number(profile.height_cm),
          age: ageFromBirthYear(profile.birth_year),
          bodyFatPct: profile.body_fat_pct,
        })
      : null;

  return calibrationWrap({
    startedAt,
    weighIns: weights.map((w) => ({ date: w.date, kg: w.weight_kg })),
    intake,
    activity: coach.activity,
    observed: coach.observed,
    predictedTdeeKcal: coach.predictedTdee,
    holdTargetKcal: coach.current.kcal,
    // The same maintenance the graduating target was cut from, so the screen
    // can't quote a figure the plan wasn't built on.
    maintenanceKcal: coach.maintenanceKcal ?? coach.current.kcal,
    newTarget: coach.review.macros,
    weightKg,
    goalWeightKg: profile?.goal_weight_kg ?? null,
    sex: profile?.sex ?? "female",
    bodyFatPct: profile?.body_fat_pct ?? null,
    restingRateKcal,
  });
});

// Recent weigh-ins, oldest→newest, for the dashboard trend chart.
export async function getWeightHistory(
  days = 30,
): Promise<{ date: string; weight_kg: number }[]> {
  const supabase = await createClient();
  const cut = isoDay(new Date(Date.now() - (days - 1) * DAY_MS));
  const { data } = await supabase
    .from("weights")
    .select("date, weight_kg")
    .gte("date", cut)
    .order("date", { ascending: true });
  return ((data as { date: string; weight_kg: number }[]) ?? []).map((r) => ({
    date: r.date,
    weight_kg: Number(r.weight_kg),
  }));
}

// Recent activity (steps / burn / sleep), oldest→newest, for the charts.
export async function getActivityHistory(days = 14): Promise<Activity[]> {
  const supabase = await createClient();
  const cut = isoDay(new Date(Date.now() - (days - 1) * DAY_MS));
  const { data } = await supabase
    .from("activity")
    .select("date, steps, workout_kcal, sleep_hours, source")
    .gte("date", cut)
    .order("date", { ascending: true });
  return (data as Activity[]) ?? [];
}

// A PostgREST numeric arrives as a string; coerce to number, keeping null.
const numOrNull = (v: unknown): number | null =>
  v == null ? null : Number(v);

// Shape a raw check_ins row (numeric columns as strings) into a CheckIn.
function toCheckIn(r: Record<string, unknown>): CheckIn {
  return {
    id: r.id as string,
    week_start: r.week_start as string,
    date: r.date as string,
    weight_kg: numOrNull(r.weight_kg),
    chest_cm: numOrNull(r.chest_cm),
    waist_cm: numOrNull(r.waist_cm),
    arms_cm: numOrNull(r.arms_cm),
    thighs_cm: numOrNull(r.thighs_cm),
    hips_cm: numOrNull(r.hips_cm),
    note: (r.note as string | null) ?? null,
    created_at: r.created_at as string,
  };
}

// Short-lived signed URLs for private photos, keyed by storage path. The bucket
// is private, so this is the only way the browser can fetch a file.
//
// One request for the whole set. Signing them one at a time meant a separate
// HTTP call to Storage per photo, a year of weekly check-ins with three angles
// each is 150-odd sequential-ish calls before the Progress page can render, and
// they all serialise behind the same connection pool.
const PHOTO_URL_TTL_SECONDS = 60 * 60;
async function signPhotoUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;

  const { data } = await supabase.storage
    .from("check-in-photos")
    .createSignedUrls(paths, PHOTO_URL_TTL_SECONDS);

  for (const row of data ?? []) {
    // A path that failed to sign comes back with a null url; leave it out so the
    // caller sees the same "no url" it saw before rather than an empty string.
    if (row.signedUrl) signed.set(row.path ?? "", row.signedUrl);
  }
  return signed;
}

// This week's check-in, or null when it hasn't been done yet. Drives whether the
// Progress page shows a "check in for this week" prompt or a done state. The week
// turns over on the user's Monday, not the server's.
export async function getCurrentCheckIn(): Promise<CheckIn | null> {
  const supabase = await createClient();
  const tz = await getTimezone();
  const { data } = await supabase
    .from("check_ins")
    .select("*")
    .eq("week_start", localWeekStart(tz))
    .maybeSingle();
  return data ? toCheckIn(data as Record<string, unknown>) : null;
}

// The most recent check-in of an EARLIER week than `exceptWeekStart` (defaults to
// this week), used both to prefill the form and as the baseline the confirmation
// deltas measure against. Null on a user's very first check-in.
export async function getPreviousCheckIn(
  exceptWeekStart?: string,
): Promise<CheckIn | null> {
  const supabase = await createClient();
  const tz = await getTimezone();
  const before = exceptWeekStart ?? localWeekStart(tz);
  const { data } = await supabase
    .from("check_ins")
    .select("*")
    .lt("week_start", before)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toCheckIn(data as Record<string, unknown>) : null;
}

// All past check-ins, newest first, each with its photos (already signed for
// display). For the Progress history list. `limit` caps how many weeks back.
export async function getCheckInHistory(
  limit = 52,
): Promise<(CheckIn & { photos: CheckInPhoto[] })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("check_ins")
    .select("*")
    .order("week_start", { ascending: false })
    .limit(limit);
  const checkIns = ((data as Record<string, unknown>[]) ?? []).map(toCheckIn);
  if (checkIns.length === 0) return [];

  const { data: photoData } = await supabase
    .from("check_in_photos")
    .select("id, check_in_id, storage_path, angle, created_at")
    .in(
      "check_in_id",
      checkIns.map((c) => c.id),
    )
    .order("created_at", { ascending: true });
  const photoRows = (photoData as CheckInPhoto[]) ?? [];

  const urls = await signPhotoUrls(
    supabase,
    photoRows.map((p) => p.storage_path),
  );
  const signed = photoRows.map((p) => ({
    ...p,
    signed_url: urls.get(p.storage_path),
  }));
  const byCheckIn = new Map<string, CheckInPhoto[]>();
  for (const p of signed) {
    const list = byCheckIn.get(p.check_in_id) ?? [];
    list.push(p);
    byCheckIn.set(p.check_in_id, list);
  }

  return checkIns.map((c) => ({ ...c, photos: byCheckIn.get(c.id) ?? [] }));
}

// Whether the user has linked a wearable, Fitbit/Google Health (a token row)
// or Apple (an ingest token). Lets the dashboard show a "connect to see sleep /
// exercise" placeholder instead of an empty chart when nothing feeds it.
export async function getDeviceConnected(): Promise<boolean> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return false;

  // The Apple side comes off the cached profile, the same users row, already
  // fetched for this request, so only the Fitbit token needs asking for.
  const [fitbitRes, profile] = await Promise.all([
    supabase.from("fitbit_tokens").select("user_id").eq("user_id", user.id).maybeSingle(),
    getProfile(),
  ]);
  const hasFitbit = Boolean((fitbitRes.data as { user_id: string } | null)?.user_id);
  const hasApple = Boolean(secretsOf(profile).apple_ingest_token);
  return hasFitbit || hasApple;
}

// Measurement series for the dashboard chart, oldest→newest, drawn from
// check-ins. Each point carries every tape reading so the chart can switch which
// one it shows. Days back caps the window (all = a big number).
export async function getMeasurementHistory(days = 365): Promise<
  {
    date: string;
    chest_cm: number | null;
    waist_cm: number | null;
    arms_cm: number | null;
    thighs_cm: number | null;
    hips_cm: number | null;
  }[]
> {
  const supabase = await createClient();
  const cut = isoDay(new Date(Date.now() - (days - 1) * DAY_MS));
  const { data } = await supabase
    .from("check_ins")
    .select("date, chest_cm, waist_cm, arms_cm, thighs_cm, hips_cm")
    .gte("date", cut)
    .order("date", { ascending: true });
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    date: r.date as string,
    chest_cm: numOrNull(r.chest_cm),
    waist_cm: numOrNull(r.waist_cm),
    arms_cm: numOrNull(r.arms_cm),
    thighs_cm: numOrNull(r.thighs_cm),
    hips_cm: numOrNull(r.hips_cm),
  }));
}

// Singular readings of a plural query, most conservative first, so a plural
// still finds the reference food ("cookies" → "cookie", "potatoes" → "potato",
// "berries" → "berry"). The reference names foods in the singular and the match
// is a plain `ilike`, so without this the natural way to type a food draws a
// blank. Only the last word is touched, that's the noun. Empty when the word
// isn't a plural we recognise.
function singularTerms(q: string): string[] {
  const words = q.split(/\s+/);
  const last = words[words.length - 1].toLowerCase();
  if (last.length <= 3 || !last.endsWith("s") || last.endsWith("ss")) return [];

  const stems = [
    last.slice(0, -1), // cookies → cookie, apples → apple
    last.endsWith("es") ? last.slice(0, -2) : null, // potatoes → potato
    last.endsWith("ies") ? `${last.slice(0, -3)}y` : null, // berries → berry
  ];
  return [...new Set(stems.filter((s): s is string => !!s && s.length >= 3))].map(
    (stem) => [...words.slice(0, -1), stem].join(" "),
  );
}

// The words of a query worth matching on. One-character fragments match
// everything, so they're dropped.
function searchWords(q: string): string[] {
  return (q.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 1);
}

// The British→American word swaps, cached per request. A tiny table, read by
// every keystroke's search, and it cannot change mid-request.
const getFoodAliases = cache(async function getFoodAliases(): Promise<
  { alias: string; term: string }[]
> {
  const supabase = await createClient();
  const { data } = await supabase.from("food_aliases").select("alias, term");
  return ((data as { alias: string; term: string }[]) ?? []).map((a) => ({
    alias: a.alias.toLowerCase(),
    term: a.term.toLowerCase(),
  }));
});

// Rewrite a query into the words the reference actually uses. Returns null when
// nothing matched, the caller then skips the second search rather than
// repeating the first.
//
// One left-to-right pass over the words, never re-reading what it has already
// written. Doing it as repeated string replacement cascades: "crisps" becomes
// "potato chips", and the "chips" rule then fires on that output and turns it
// into "potato french fries". At each position the longest alias that starts
// there wins, so "spring onion" is swapped whole rather than leaving a stray
// "onion" behind.
export function applyAliases(
  q: string,
  aliases: { alias: string; term: string }[],
): string | null {
  const words = q.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (words.length === 0) return null;

  // Alias phrases by their word count, longest first.
  const byLength = [...aliases]
    .map((a) => ({ words: a.alias.split(/\s+/).filter(Boolean), term: a.term }))
    .filter((a) => a.words.length > 0)
    .sort((a, b) => b.words.length - a.words.length);
  const longest = byLength[0]?.words.length ?? 0;

  const out: string[] = [];
  let hit = false;
  for (let i = 0; i < words.length; ) {
    let taken = 0;
    for (const a of byLength) {
      if (a.words.length > longest || i + a.words.length > words.length) continue;
      if (a.words.every((w, k) => w === words[i + k])) {
        out.push(a.term);
        taken = a.words.length;
        hit = true;
        break;
      }
    }
    if (taken === 0) {
      out.push(words[i]);
      taken = 1;
    }
    i += taken;
  }
  return hit ? out.join(" ") : null;
}

// How well a reference food answers what was typed. Lower is better.
//
// Needed because the reference is now thousands of USDA rows whose names are
// comma-inverted and heavily qualified ("Cake or cupcake, chocolate with
// chocolate icing, bakery"). Every row returned already contains every word
// searched for, so the question is which is the *tightest* answer: the one
// carrying the fewest words the user never asked for.
export function rankFreshFood(query: string, name: string): number {
  const q = query.trim().toLowerCase();
  const n = name.trim().toLowerCase();
  if (n === q) return 0;
  const asked = new Set(searchWords(q));
  const extra = searchWords(n).filter((w) => !asked.has(w)).length;
  // A name that opens with what was typed is the plain reading of it
  // ("Croissant" for "croissant", "Cake, chocolate…" for "cake").
  return (n.startsWith(q) ? 1 : 2) * 1000 + extra * 10 + Math.min(n.length, 9) / 10;
}

// Order a batch of rows by how tightly each answers the words that found it.
function sortByRank<T extends { name: string }>(rows: T[], term: string): T[] {
  return [...rows].sort(
    (a, b) =>
      rankFreshFood(term, a.name) - rankFreshFood(term, b.name) ||
      a.name.localeCompare(b.name),
  );
}

// Foods from the shared reference matching what the user is typing, each with
// its sizes attached. Empty for a query shorter than two characters (too broad).
//
// Matching is word by word, not as one substring: the reference names foods
// "Cake or cupcake, chocolate with chocolate icing, bakery", so a substring
// search for "chocolate cake" finds nothing at all while an AND of "chocolate"
// and "cake" finds it. Three passes, cheapest first, as typed, then with
// British words swapped for the American ones the data uses (see 0034), then
// with a plural singularised.
//
// Read in two steps, foods, then their sizes, so it works without a nested
// join (and against the test fake). Numeric columns arrive as strings from
// PostgREST, so every macro and gram is coerced to a number here.
const SEARCH_POOL = 40;

export async function searchFreshFoods(query: string): Promise<FreshFood[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const byWords = async (term: string) => {
    const words = searchWords(term);
    if (words.length === 0) return [];
    let sel = supabase
      .from("fresh_foods")
      .select(
        "id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, satfat_100g, sodium_mg_100g, cooked",
      );
    // Chained filters AND, so every word must appear somewhere in the name.
    for (const w of words) sel = sel.ilike("name", `%${w}%`);
    const { data } = await sel.order("name", { ascending: true }).limit(SEARCH_POOL);
    return (data as (Omit<FreshFood, "sizes"> & Record<string, unknown>)[]) ?? [];
  };

  // The British reading runs whether or not the literal one found anything, and
  // its hits come first. "chips" is why: searched literally it finds "Potato
  // chips", a real result and the wrong food, so waiting for the literal search
  // to fail would never rescue it. The literal hits stay, underneath, because
  // the reference also holds British foods seeded by hand (0032) that no alias
  // points at.
  const aliasedQuery = applyAliases(q, await getFoodAliases());
  const [literal, aliased] = await Promise.all([
    byWords(q),
    aliasedQuery ? byWords(aliasedQuery) : Promise.resolve([]),
  ]);

  // Rank each reading against the words that produced it, then concatenate,
  // the aliased reading first, deduped by id.
  const seen = new Set<string>();
  let foods = [
    ...sortByRank(aliased, aliasedQuery ?? q),
    ...sortByRank(literal, q),
  ].filter((f) => !seen.has(f.id) && seen.add(f.id));

  // Nothing at all: try a plural made singular ("cookies" → "cookie").
  for (const singular of foods.length === 0 ? singularTerms(q) : []) {
    const rows = await byWords(singular);
    if (rows.length > 0) {
      foods = sortByRank(rows, singular);
      break;
    }
  }
  if (foods.length === 0) return [];
  foods = foods.slice(0, 8);

  const { data: sizeData } = await supabase
    .from("fresh_food_sizes")
    .select("id, food_id, label, grams")
    .in(
      "food_id",
      foods.map((f) => f.id),
    );
  const sizes = (sizeData as FreshFoodSize[]) ?? [];

  // Order is already decided above (aliased reading first, each group ranked);
  // this only shapes the rows.
  return foods.map((f) => ({
    id: f.id,
    name: f.name,
    kcal_100g: Number(f.kcal_100g),
    protein_100g: Number(f.protein_100g),
    carbs_100g: Number(f.carbs_100g),
    fat_100g: Number(f.fat_100g),
    fiber_100g: Number(f.fiber_100g),
    sugar_100g: Number(f.sugar_100g),
    satfat_100g: Number(f.satfat_100g),
    sodium_mg_100g: Number(f.sodium_mg_100g),
    cooked: Boolean(f.cooked),
    sizes: sizes
      .filter((s) => s.food_id === f.id)
      .map((s) => ({ label: s.label, grams: Number(s.grams) }))
      .sort((a, b) => a.grams - b.grams),
  }));
}

// --- Progress insights -------------------------------------------------------

// Food logged per LOCAL day, with macros, over a window. Sibling of
// getDailyIntake (which only needs calories, for the coach); the insights cards
// break intake down by macro and by weekday, so they need the whole row.
//
// Days with nothing logged are absent rather than zero, an unlogged day is
// unknown, and scoring it as a fast would flatter every average built on it.
export async function getDailyMacros(days = 180): Promise<DayIntake[]> {
  const supabase = await createClient();
  const tz = await getTimezone();
  const from = startOfLocalDay(tz, new Date(Date.now() - (days - 1) * DAY_MS));

  const { data } = await supabase
    .from("food_logs")
    .select("logged_at, kcal, protein_g, carbs_g, fat_g")
    .gte("logged_at", from.toISOString());

  const byDay = new Map<string, DayIntake>();
  for (const row of (data as Record<string, unknown>[]) ?? []) {
    const date = localDate(tz, new Date(row.logged_at as string));
    const acc = byDay.get(date) ?? {
      date,
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    };
    acc.kcal += Number(row.kcal ?? 0);
    acc.protein_g += Number(row.protein_g ?? 0);
    acc.carbs_g += Number(row.carbs_g ?? 0);
    acc.fat_g += Number(row.fat_g ?? 0);
    byDay.set(date, acc);
  }

  return [...byDay.values()]
    .filter((d) => d.kcal > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Every weekly target the user has been given, oldest first. The insights cards
// judge a week against the target that was actually in force THAT week, not
// against today's, a target that was cut in June shouldn't retroactively make
// May look like an overshoot.
export async function getTargetHistory(weeks = 52): Promise<WeekTarget[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_targets")
    .select("week_start, kcal, protein_g, carbs_g, fat_g")
    .order("week_start", { ascending: false })
    .limit(weeks);

  return ((data as Record<string, unknown>[]) ?? [])
    .map((r) => ({
      week_start: r.week_start as string,
      kcal: Number(r.kcal),
      protein_g: Number(r.protein_g),
      carbs_g: Number(r.carbs_g),
      fat_g: Number(r.fat_g),
    }))
    .sort((a, b) => a.week_start.localeCompare(b.week_start));
}

// The days the user took as high days, for the cycling-impact comparison.
export async function getHighDayDates(days = 180): Promise<string[]> {
  const supabase = await createClient();
  const cut = isoDay(new Date(Date.now() - (days - 1) * DAY_MS));
  const { data } = await supabase
    .from("high_days")
    .select("date")
    .gte("date", cut)
    .order("date", { ascending: true });
  return ((data as { date: string }[]) ?? []).map((r) => r.date);
}

// The user's logged non-scale victories, newest first.
export async function getNonScaleVictories(limit = 50): Promise<NonScaleVictory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("non_scale_victories")
    .select("id, date, text")
    .order("date", { ascending: false })
    .limit(limit);
  return (data as NonScaleVictory[]) ?? [];
}

// Milestones the user set for themselves, oldest first.
export async function getCustomMilestones(): Promise<CustomMilestone[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("custom_milestones")
    .select("id, label, target_weight_kg, reached_at")
    .order("created_at", { ascending: true });
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    target_weight_kg: numOrNull(r.target_weight_kg),
    reached_at: (r.reached_at as string | null) ?? null,
  }));
}

// Everything the Progress insights dashboard reads, in one round trip.
export interface InsightsData {
  profile: Profile | null;
  today: string;
  weights: { date: string; weight_kg: number }[];
  checkIns: (CheckIn & { photos: CheckInPhoto[] })[];
  intake: DayIntake[];
  targets: WeekTarget[];
  // The target actually IN FORCE, resolved the way the rest of the app resolves
  // it, most recent row on or before this week, pinned to the onboarding anchor
  // while calibrating. `targets` is the raw history, for judging a past week
  // against the row that was live then; scoring THIS week against a row picked
  // out of that history by date instead of through here is how the scorecard
  // came to grade the user against a number the app was never showing them.
  currentTarget: DailyTargets | null;
  // The refeed settings behind this week, so a day the app planned at
  // maintenance is scored against maintenance.
  cycle: CycleConfig;
  activity: Activity[];
  highDayDates: string[];
  victories: NonScaleVictory[];
  customMilestones: CustomMilestone[];
  deviceConnected: boolean;
}

// How far back the dashboard looks. A year of weigh-ins and check-ins (the
// journey), half a year of food and activity (enough weeks for every driver
// card, without dragging the whole food diary over the wire).
const INSIGHTS_BODY_DAYS = 365;
const INSIGHTS_HABIT_DAYS = 180;

export async function getInsightsData(): Promise<InsightsData> {
  const [
    profile,
    today,
    weights,
    checkIns,
    intake,
    targets,
    activity,
    highDayDates,
    victories,
    customMilestones,
    deviceConnected,
    currentTarget,
    latestWeight,
  ] = await Promise.all([
    getProfile(),
    localToday(),
    getWeightHistory(INSIGHTS_BODY_DAYS),
    getCheckInHistory(),
    getDailyMacros(INSIGHTS_HABIT_DAYS),
    getTargetHistory(),
    getActivityHistory(INSIGHTS_HABIT_DAYS),
    getHighDayDates(INSIGHTS_HABIT_DAYS),
    getNonScaleVictories(),
    getCustomMilestones(),
    getDeviceConnected(),
    getCurrentTargets(),
    getLatestWeight(),
  ]);

  // The same recipe the home ring and the day planner use (see
  // getHighDayStatus), so the dashboard scores days against the very targets the
  // app planned them at.
  const phase: Phase = (currentTarget?.phase as Phase | undefined) ?? "deficit";
  const cycle = profile
    ? cycleConfigFrom(profile, phase, maintenanceKcalFor(profile, latestWeight))
    : { enabled: false, refeedDaysPerWeek: 0, maintenanceKcal: null };

  return {
    profile,
    today,
    weights,
    checkIns,
    intake,
    targets,
    currentTarget,
    cycle,
    activity,
    highDayDates,
    victories,
    customMilestones,
    deviceConnected,
  };
}

// Cached per request: the home page reads the latest weight directly and again
// through getHighDayStatus (for the carb floor) in the same render. Same weigh-in
// either way within a request.
export const getLatestWeight = cache(async function getLatestWeight(): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("weights")
    .select("weight_kg")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? Number((data as { weight_kg: number }).weight_kg) : null;
});
