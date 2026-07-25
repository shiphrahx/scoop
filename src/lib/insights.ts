// Progress insights: the maths behind the Progress dashboard.
//
// Everything here is a pure function over rows the app already stores. Nothing
// fetches, nothing writes — the queries hand these functions plain arrays and
// the UI renders what comes back. That's deliberate: these are the numbers a
// user makes decisions about their body from, and they need to be testable
// without a database.
//
// Two rules run through the whole file:
//
//   1. Never speak from a single day. Bodyweight swings a kilo on salt and
//      water alone, so every weight number here comes off the smoothed trend
//      (see trendSeries in coach.ts) or a regression through it, never off the
//      last reading.
//   2. Say nothing rather than guess. Each module returns null when the history
//      behind it is too thin to mean anything, and the UI hides the card. A
//      confident-looking projection drawn through four days is worse than no
//      projection at all.

import {
  average,
  healthyLossBand,
  trendChange,
  trendSeries,
  weightSlopeKgPerDay,
  type TrendChange,
  type WeighIn,
} from "@/lib/coach";
import { addDaysISO, weekStartOf } from "@/lib/time";
import type { PhotoAngle, Sex } from "@/lib/types";

const DAY_MS = 86_400_000;

// Round to `dp` decimal places, returning a number (not a string) so callers can
// still compare and format. Every figure this file hands the UI goes through it.
export function round(value: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

// --- 1. Trend line over the raw dots ----------------------------------------

export interface TrendPoint {
  date: string;
  // The scale reading for that day, when the user stood on it. Null on days
  // they didn't — drawn as a gap in the dots, not as a zero.
  weight: number | null;
  // The smoothed trend, carried forward across missed days.
  trend: number;
}

// How few weigh-ins make a trend line meaningless. Two points is a straight
// line through noise; below a week the smoothing hasn't done anything yet.
export const MIN_WEIGH_INS_FOR_TREND = 4;

// The daily dots with the smoothed line laid over them.
//
// This is the shape of the main weight chart: raw readings so the user can see
// their own data, and the trend so they can see through it. Showing only the
// dots is what makes people despair on a Monday; showing only the line looks
// like we're hiding something.
export function trendLine(points: WeighIn[]): TrendPoint[] {
  const clean = points.filter((p) => Number.isFinite(p.kg) && p.kg > 0);
  if (clean.length < MIN_WEIGH_INS_FOR_TREND) return [];

  const byDay = new Map<string, number[]>();
  for (const p of clean) {
    const list = byDay.get(p.date);
    if (list) list.push(p.kg);
    else byDay.set(p.date, [p.kg]);
  }

  return trendSeries(clean).map((t) => {
    const same = byDay.get(t.date);
    return {
      date: t.date,
      weight: same ? round(average(same)!, 1) : null,
      trend: round(t.kg, 2),
    };
  });
}

// --- 2. Rate of loss vs the target rate --------------------------------------

export type RateVerdict = "gaining" | "slow" | "on-track" | "fast";

export interface LossRate {
  kgPerWeek: number; // positive = losing
  pctPerWeek: number; // as a percentage of bodyweight, e.g. 0.7
  // The healthy band for this person, also as percentages of bodyweight.
  bandMinPct: number;
  bandMaxPct: number;
  // The same band expressed in kg at the user's current weight, which is the
  // form people actually reason in ("half a kilo a week").
  bandMinKg: number;
  bandMaxKg: number;
  verdict: RateVerdict;
}

// This week's rate of loss, in kg and as a share of bodyweight, judged against
// what's healthy for this person.
//
// The band is body-fat aware (see healthyLossBand): 1%/week is fine with plenty
// of fat to draw on and is muscle loss at 12% body fat. Reporting the rate
// without the band invites the user to chase a bigger number.
export function lossRate(
  points: WeighIn[],
  sex: Sex,
  bodyFatPct?: number | null,
): LossRate | null {
  const change: TrendChange | null = trendChange(points);
  if (!change) return null;

  const band = healthyLossBand(sex, bodyFatPct);
  const pct = change.changePct;

  const verdict: RateVerdict =
    pct <= 0
      ? "gaining"
      : pct < band.min
        ? "slow"
        : pct > band.max
          ? "fast"
          : "on-track";

  return {
    kgPerWeek: round(change.changeKg, 2),
    pctPerWeek: round(pct * 100, 2),
    bandMinPct: round(band.min * 100, 2),
    bandMaxPct: round(band.max * 100, 2),
    bandMinKg: round(band.min * change.nowKg, 2),
    bandMaxKg: round(band.max * change.nowKg, 2),
    verdict,
  };
}

// --- shared: regression through the trend ------------------------------------

const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

// Least-squares fit of kg against day, plus the standard error of the slope.
// The error is what turns a projection into a range: a tidy downward line
// projects a narrow window, a noisy one projects a wide one, and that
// difference is exactly what the user needs to know.
export function slopeWithError(
  points: WeighIn[],
): { slopeKgPerDay: number; stdErrKgPerDay: number; n: number } | null {
  const clean = points.filter((p) => Number.isFinite(p.kg) && p.kg > 0);
  if (clean.length < 3) return null;

  const slope = weightSlopeKgPerDay(clean);
  if (slope == null) return null;

  const xs = clean.map((p) => dayMs(p.date) / DAY_MS);
  const ys = clean.map((p) => p.kg);
  const xMean = average(xs)!;
  const yMean = average(ys)!;
  const intercept = yMean - slope * xMean;

  let sse = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    const resid = ys[i] - (intercept + slope * xs[i]);
    sse += resid * resid;
    sxx += (xs[i] - xMean) ** 2;
  }
  if (sxx === 0) return null;

  // n − 2 degrees of freedom: a line costs two of them.
  const variance = sse / Math.max(1, clean.length - 2);
  return {
    slopeKgPerDay: slope,
    stdErrKgPerDay: Math.sqrt(variance / sxx),
    n: clean.length,
  };
}

// --- 3. Projected goal date ---------------------------------------------------

export type Confidence = "low" | "medium" | "high";

export interface GoalProjection {
  goalKg: number;
  currentKg: number; // trend weight today
  remainingKg: number;
  // The window the goal plausibly lands in. `latest` is null when the slower
  // end of the error band doesn't reach the goal at all inside a year — an
  // honest "we can't put a back edge on this yet".
  earliest: string;
  midpoint: string;
  latest: string | null;
  weeksMid: number;
  confidence: Confidence;
}

// A projection needs a real stretch of history behind it. Three weeks is the
// shortest span where a slope means anything through normal water noise, and
// eight weigh-ins is the fewest that can draw it.
export const MIN_PROJECTION_DAYS = 21;
export const MIN_PROJECTION_WEIGH_INS = 8;

// Nothing beyond a year is a prediction; it's a mood. Anything past it is
// reported as unbounded rather than as a date in 2031.
const MAX_PROJECTION_DAYS = 365;

const addDays = (fromMs: number, days: number) =>
  new Date(fromMs + days * DAY_MS).toISOString().slice(0, 10);

// When the current trend reaches the goal weight — as a RANGE, never a date.
//
// A single "you'll hit 75 kg on 4 October" is a promise the body has not made.
// The honest version is the error band of the fitted slope: fast end, middle,
// slow end, plus how much to trust the whole thing. Null when there isn't
// enough history, when the user isn't actually losing, or when the goal is
// already met (goalProgress says that better).
export function projectGoalDate(
  points: WeighIn[],
  goalKg: number | null | undefined,
  now = new Date(),
): GoalProjection | null {
  if (goalKg == null || !(goalKg > 0)) return null;

  const clean = points.filter((p) => Number.isFinite(p.kg) && p.kg > 0);
  if (clean.length < MIN_PROJECTION_WEIGH_INS) return null;

  const dates = clean.map((p) => dayMs(p.date));
  const spanDays = (Math.max(...dates) - Math.min(...dates)) / DAY_MS;
  if (spanDays < MIN_PROJECTION_DAYS) return null;

  const fit = slopeWithError(clean);
  const series = trendSeries(clean);
  if (!fit || series.length === 0) return null;
  if (!(fit.slopeKgPerDay < 0)) return null; // flat or gaining: no arrival date

  const currentKg = series[series.length - 1].kg;
  const remainingKg = currentKg - goalKg;
  if (remainingKg <= 0) return null; // already there

  // Rates in kg lost per day. The fast edge of the band arrives first.
  const mid = -fit.slopeKgPerDay;
  const fast = mid + fit.stdErrKgPerDay;
  const slow = mid - fit.stdErrKgPerDay;

  const startMs = now.getTime();
  const daysAt = (rate: number) => (rate > 0 ? remainingKg / rate : Infinity);
  const midDays = daysAt(mid);
  const slowDays = daysAt(slow);

  if (midDays > MAX_PROJECTION_DAYS) return null; // even the middle is past the horizon

  // How tight the fit is, in the only terms that matter: how big the error is
  // next to the rate itself. A 0.05 kg/week error on a 0.5 kg/week loss is a
  // firm answer; the same error on 0.1 kg/week is barely a direction.
  const relError = fit.stdErrKgPerDay / mid;
  const confidence: Confidence =
    relError < 0.2 && spanDays >= 42
      ? "high"
      : relError < 0.4 && spanDays >= 28
        ? "medium"
        : "low";

  return {
    goalKg: round(goalKg, 1),
    currentKg: round(currentKg, 1),
    remainingKg: round(remainingKg, 1),
    earliest: addDays(startMs, Math.round(daysAt(fast))),
    midpoint: addDays(startMs, Math.round(midDays)),
    latest:
      slowDays <= MAX_PROJECTION_DAYS ? addDays(startMs, Math.round(slowDays)) : null,
    weeksMid: round(midDays / 7, 0),
    confidence,
  };
}

// --- 4. How far through the journey ------------------------------------------

export interface GoalProgress {
  startKg: number;
  currentKg: number;
  goalKg: number;
  lostKg: number; // positive = lost since the start
  remainingKg: number; // clamped at 0 once the goal is met
  pctComplete: number; // 0–100
  reached: boolean;
}

// Total lost, left to go, and the share of the journey done.
//
// The start is the FIRST smoothed value, not the first reading: someone whose
// first weigh-in happened to be a heavy day would otherwise be credited a kilo
// they never carried, and every later percentage inherits the lie.
export function goalProgress(
  points: WeighIn[],
  goalKg: number | null | undefined,
): GoalProgress | null {
  if (goalKg == null || !(goalKg > 0)) return null;

  const series = trendSeries(points.filter((p) => Number.isFinite(p.kg) && p.kg > 0));
  if (series.length === 0) return null;

  const startKg = series[0].kg;
  const currentKg = series[series.length - 1].kg;
  const journey = startKg - goalKg;
  const lostKg = startKg - currentKg;

  // Started at or below the goal: there's no journey to be a percentage of.
  if (journey <= 0) {
    return {
      startKg: round(startKg, 1),
      currentKg: round(currentKg, 1),
      goalKg: round(goalKg, 1),
      lostKg: round(lostKg, 1),
      remainingKg: 0,
      pctComplete: 100,
      reached: true,
    };
  }

  const pct = Math.max(0, Math.min(100, (lostKg / journey) * 100));
  return {
    startKg: round(startKg, 1),
    currentKg: round(currentKg, 1),
    goalKg: round(goalKg, 1),
    lostKg: round(lostKg, 1),
    remainingKg: round(Math.max(0, currentKg - goalKg), 1),
    pctComplete: round(pct, 0),
    reached: currentKg <= goalKg,
  };
}

// --- 5. Fat loss the scale can't see -----------------------------------------

// One check-in's tape readings. Only what the body modules need; the full row
// lives in CheckIn.
export interface TapePoint {
  date: string;
  waist_cm: number | null;
  hips_cm: number | null;
  thighs_cm: number | null;
  arms_cm: number | null;
  chest_cm: number | null;
}

export interface FatLossSignal {
  windowDays: number;
  weightDeltaKg: number; // positive = the scale went UP
  waistDeltaCm: number; // negative = the waist shrank
  detected: boolean;
}

// The window the detector compares over. Four weeks: long enough that a single
// week of water retention can't fake it, short enough to still be news.
export const FAT_LOSS_WINDOW_DAYS = 28;

// How flat the scale has to be, and how much waist has to go, before we say it.
// Half a centimetre is about the limit of what a tape measure can resolve
// honestly; below that we'd be reading measurement error back to the user as
// progress.
const FLAT_SCALE_KG = -0.2; // weight change at or above this counts as "not falling"
const REAL_WAIST_DROP_CM = -0.5;

// "The scale is stuck but you're losing fat" — said only when the data actually
// says it.
//
// This is the single most useful thing a weight-loss app can tell someone,
// because it's the moment most people quit. Recomposition is real: glycogen and
// water refill as fat leaves, and the scale sits still for weeks while the tape
// keeps moving. Null when there isn't a pair of tape readings spanning the
// window to compare — the callout has to be earned.
export function fatLossSignal(
  weighIns: WeighIn[],
  tape: TapePoint[],
  windowDays = FAT_LOSS_WINDOW_DAYS,
  now = new Date(),
): FatLossSignal | null {
  const cutoff = new Date(now.getTime() - (windowDays - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const waist = tape
    .filter((t) => t.waist_cm != null && t.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (waist.length < 2) return null;

  const series = trendSeries(
    weighIns.filter((p) => Number.isFinite(p.kg) && p.kg > 0 && p.date >= cutoff),
  );
  if (series.length < 2) return null;

  const weightDeltaKg = series[series.length - 1].kg - series[0].kg;
  const waistDeltaCm = waist[waist.length - 1].waist_cm! - waist[0].waist_cm!;

  return {
    windowDays,
    weightDeltaKg: round(weightDeltaKg, 1),
    waistDeltaCm: round(waistDeltaCm, 1),
    detected: weightDeltaKg >= FLAT_SCALE_KG && waistDeltaCm <= REAL_WAIST_DROP_CM,
  };
}

// --- 6. Waist-to-height ratio -------------------------------------------------

export type WhtrBand = "low" | "healthy" | "increased" | "high";

export interface WaistToHeight {
  ratio: number; // waist ÷ height, e.g. 0.48
  band: WhtrBand;
  waistCm: number;
  heightCm: number;
  // The waist that would put this person at the top of the healthy band, so the
  // UI can show something to aim at rather than only a verdict.
  healthyMaxWaistCm: number;
}

// Band edges as a share of height. "Keep your waist to less than half your
// height" is the NICE guideline; below 0.4 is thin enough to be worth flagging
// rather than praising, and 0.6 is where the risk curve turns sharply up.
const WHTR_LOW = 0.4;
const WHTR_HEALTHY_MAX = 0.5;
const WHTR_INCREASED_MAX = 0.6;

// Waist against height — a better read on health risk than BMI, and one the app
// already has both numbers for.
//
// BMI can't tell a lifter from a couch, because it doesn't know where the mass
// sits. Visceral fat around the middle is the part that predicts metabolic
// trouble, and the tape measures exactly that. Null when either number is
// missing (no waist check-in yet, or no height on the profile).
export function waistToHeight(
  waistCm: number | null | undefined,
  heightCm: number | null | undefined,
): WaistToHeight | null {
  if (waistCm == null || !(waistCm > 0)) return null;
  if (heightCm == null || !(heightCm > 0)) return null;

  const ratio = waistCm / heightCm;
  const band: WhtrBand =
    ratio < WHTR_LOW
      ? "low"
      : ratio < WHTR_HEALTHY_MAX
        ? "healthy"
        : ratio < WHTR_INCREASED_MAX
          ? "increased"
          : "high";

  return {
    ratio: round(ratio, 2),
    band,
    waistCm: round(waistCm, 1),
    heightCm: round(heightCm, 0),
    healthyMaxWaistCm: round(heightCm * WHTR_HEALTHY_MAX, 0),
  };
}

// --- 7. Progress-photo comparison ---------------------------------------------

export interface ComparablePhoto {
  angle: PhotoAngle;
  date: string;
  url: string;
}

export interface PhotoPair {
  angle: PhotoAngle;
  start: ComparablePhoto;
  latest: ComparablePhoto;
  weeksApart: number;
}

// The first and most recent photo of each angle, so the UI can put a slider
// between them.
//
// Photos are the only record that shows what the numbers can't: shape. But a
// side-by-side is only worth showing when the two shots are the same view and
// far enough apart to differ, so this pairs strictly by angle and drops any
// angle with a single photo or both shots in the same week. Signed URLs are
// short-lived, so anything without one is skipped rather than rendered broken.
export function photoPairs(
  checkIns: {
    date: string;
    photos: { angle: PhotoAngle; signed_url?: string }[];
  }[],
): PhotoPair[] {
  const byAngle = new Map<PhotoAngle, ComparablePhoto[]>();
  for (const c of checkIns) {
    for (const p of c.photos) {
      if (!p.signed_url) continue;
      const list = byAngle.get(p.angle) ?? [];
      list.push({ angle: p.angle, date: c.date, url: p.signed_url });
      byAngle.set(p.angle, list);
    }
  }

  const order: PhotoAngle[] = ["front", "side", "back", "other"];
  const pairs: PhotoPair[] = [];
  for (const angle of order) {
    const list = (byAngle.get(angle) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    if (list.length < 2) continue;
    const start = list[0];
    const latest = list[list.length - 1];
    const weeksApart = (dayMs(latest.date) - dayMs(start.date)) / DAY_MS / 7;
    if (weeksApart < 1) continue;
    pairs.push({ angle, start, latest, weeksApart: round(weeksApart, 0) });
  }
  return pairs;
}

// --- Weekly buckets (the spine of every driver card) --------------------------

// One day's food, summed from the log.
export interface DayIntake {
  date: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// One day of wearable data.
export interface DayActivity {
  date: string;
  steps: number | null;
  workout_kcal: number | null;
  sleep_hours: number | null;
}

// One week's calorie/macro target, as it stood that week.
export interface WeekTarget {
  week_start: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface InsightWeek {
  weekStart: string; // the Monday
  // Movement of the smoothed trend across the week. Negative = lost. Null on
  // the first week (nothing to compare against) or a week with no weigh-ins.
  weightChangeKg: number | null;
  meanKcal: number | null;
  meanProteinG: number | null;
  loggedDays: number;
  targetKcal: number | null;
  // 100 = ate the target exactly every logged day, 0 = missed it by 100% or
  // more. Null with no target or no logged days.
  adherencePct: number | null;
  meanSleepH: number | null;
  meanSteps: number | null;
  meanWorkoutKcal: number | null;
  highDays: number;
}

export interface WeeklyInput {
  weighIns: WeighIn[];
  intake: DayIntake[];
  activity: DayActivity[];
  targets: WeekTarget[];
  highDayDates: string[];
}

// Roll everything the app knows up into weeks, Monday to Sunday.
//
// Every driver card downstream is a comparison of one weekly column against
// another, so they all read from this one builder. Doing it once means "week"
// means the same thing on every card — and means a fix to how a week is
// bucketed can't half-land.
export function weeklyBuckets(input: WeeklyInput): InsightWeek[] {
  const trend = trendSeries(
    input.weighIns.filter((p) => Number.isFinite(p.kg) && p.kg > 0),
  );

  // Last trend value seen in each week — the week's closing weight.
  const closing = new Map<string, number>();
  for (const t of trend) closing.set(weekStartOf(t.date), t.kg);

  const bucket = <T extends { date: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const r of rows) {
      const wk = weekStartOf(r.date);
      const list = map.get(wk) ?? [];
      list.push(r);
      map.set(wk, list);
    }
    return map;
  };

  const intakeByWeek = bucket(input.intake);
  const activityByWeek = bucket(input.activity);
  const targetByWeek = new Map(input.targets.map((t) => [t.week_start, t]));
  const highByWeek = new Map<string, number>();
  for (const d of input.highDayDates) {
    const wk = weekStartOf(d);
    highByWeek.set(wk, (highByWeek.get(wk) ?? 0) + 1);
  }

  const weeks = [
    ...new Set([
      ...closing.keys(),
      ...intakeByWeek.keys(),
      ...activityByWeek.keys(),
      ...highByWeek.keys(),
    ]),
  ].sort();

  // Carry the last known closing weight forward so a week with no weigh-ins
  // doesn't make the NEXT week's change look like a fortnight of loss.
  return weeks.map((weekStart, i) => {
    const prevWeek = i > 0 ? weeks[i - 1] : null;
    const here = closing.get(weekStart);
    const there = prevWeek != null ? closing.get(prevWeek) : undefined;
    const weightChangeKg =
      here != null && there != null ? round(here - there, 2) : null;

    const days = intakeByWeek.get(weekStart) ?? [];
    const acts = activityByWeek.get(weekStart) ?? [];
    const target = targetByWeek.get(weekStart) ?? null;

    const meanKcal = average(days.map((d) => d.kcal));
    const adherencePct =
      target && target.kcal > 0 && days.length > 0
        ? round(
            average(
              days.map((d) =>
                Math.max(0, 100 - (Math.abs(d.kcal - target.kcal) / target.kcal) * 100),
              ),
            )!,
            0,
          )
        : null;

    const meanOf = (pick: (a: DayActivity) => number | null) => {
      const vals = acts.map(pick).filter((v): v is number => v != null);
      const m = average(vals);
      return m == null ? null : m;
    };

    const sleep = meanOf((a) => a.sleep_hours);
    const steps = meanOf((a) => a.steps);
    const burn = meanOf((a) => a.workout_kcal);

    return {
      weekStart,
      weightChangeKg,
      meanKcal: meanKcal == null ? null : round(meanKcal, 0),
      meanProteinG: (() => {
        const m = average(days.map((d) => d.protein_g));
        return m == null ? null : round(m, 0);
      })(),
      loggedDays: days.length,
      targetKcal: target ? Math.round(target.kcal) : null,
      adherencePct,
      meanSleepH: sleep == null ? null : round(sleep, 1),
      meanSteps: steps == null ? null : Math.round(steps),
      meanWorkoutKcal: burn == null ? null : Math.round(burn),
      highDays: highByWeek.get(weekStart) ?? 0,
    };
  });
}

// --- 8. Drivers: the correlation engine + sleep -------------------------------

export type Strength = "none" | "weak" | "moderate" | "strong";
export type Direction = "helps" | "hurts" | "none";

export interface Correlation {
  r: number; // Pearson correlation of the driver against kg LOST
  n: number; // weeks compared
  strength: Strength;
  direction: Direction;
  // Each week as a plotted point: the driver on x, kg lost on y.
  points: { weekStart: string; x: number; y: number }[];
  // The driver's mean in the weeks that went best vs the weeks that went worst
  // — the same finding stated in a way a person can act on.
  bestWeeksMean: number;
  worstWeeksMean: number;
}

// Fewer weeks than this and a correlation is a coincidence with a decimal
// point. Four is already generous; the UI says "patterns, not proof" on top.
export const MIN_CORRELATION_WEEKS = 4;

// |r| below this is noise and gets reported as no relationship at all, rather
// than as a faint one the user will over-read.
const R_NOISE = 0.3;

// Pearson's r. Null when a series doesn't vary (every week identical), because
// a constant can't correlate with anything and the formula divides by zero.
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const xMean = average(xs)!;
  const yMean = average(ys)!;
  let num = 0;
  let xss = 0;
  let yss = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    num += dx * dy;
    xss += dx * dx;
    yss += dy * dy;
  }
  if (xss === 0 || yss === 0) return null;
  return num / Math.sqrt(xss * yss);
}

// Compare one weekly driver against how much weight came off that week.
//
// This is a paired weekly comparison and nothing more ambitious — no lags, no
// controls, no significance test. That is the honest ceiling of a few dozen
// weeks of one person's data, and it's why every card built on it is labelled
// a pattern rather than a cause.
export function correlate(
  weeks: InsightWeek[],
  pick: (w: InsightWeek) => number | null,
): Correlation | null {
  const pairs = weeks
    .map((w) => ({ weekStart: w.weekStart, x: pick(w), y: w.weightChangeKg }))
    .filter((p): p is { weekStart: string; x: number; y: number } =>
      p.x != null && p.y != null,
    )
    // y is kg LOST, so a falling trend reads as a positive result.
    .map((p) => ({ ...p, y: round(-p.y, 2) }));

  if (pairs.length < MIN_CORRELATION_WEEKS) return null;

  const r = pearson(
    pairs.map((p) => p.x),
    pairs.map((p) => p.y),
  );
  if (r == null) return null;

  const abs = Math.abs(r);
  const strength: Strength =
    abs < R_NOISE ? "none" : abs < 0.5 ? "weak" : abs < 0.7 ? "moderate" : "strong";
  const direction: Direction =
    strength === "none" ? "none" : r > 0 ? "helps" : "hurts";

  // Split the weeks at the median result and average the driver on each side.
  const byResult = [...pairs].sort((a, b) => b.y - a.y);
  const half = Math.max(1, Math.floor(byResult.length / 2));
  const best = byResult.slice(0, half).map((p) => p.x);
  const worst = byResult.slice(-half).map((p) => p.x);

  return {
    r: round(r, 2),
    n: pairs.length,
    strength,
    direction,
    points: pairs,
    bestWeeksMean: round(average(best)!, 1),
    worstWeeksMean: round(average(worst)!, 1),
  };
}

// Sleep against weight loss. Short sleep raises ghrelin and blunts insulin
// sensitivity, so this one often shows up — but it's still a pattern in one
// person's weeks, not a finding.
export function sleepVsLoss(weeks: InsightWeek[]): Correlation | null {
  return correlate(weeks, (w) => w.meanSleepH);
}

// --- 9. Drivers: exercise and steps -------------------------------------------

export type MovementMetric = "steps" | "workout";

export interface MovementCorrelation extends Correlation {
  metric: MovementMetric;
}

// Movement against weight loss, using whichever measure the user's device
// actually fills in.
//
// Steps first: for most people non-exercise movement moves the daily burn far
// more than a gym session does, and every tracker reports it. Workout calories
// are the fallback for someone whose device only logs sessions. Null when
// neither has enough weeks — which is also what a disconnected device looks
// like, so the UI shows its connect-prompt instead.
export function movementVsLoss(weeks: InsightWeek[]): MovementCorrelation | null {
  const steps = correlate(weeks, (w) => w.meanSteps);
  if (steps) return { ...steps, metric: "steps" };
  const workout = correlate(weeks, (w) => w.meanWorkoutKcal);
  if (workout) return { ...workout, metric: "workout" };
  return null;
}

// --- 10. Drivers: how closely they ate the plan --------------------------------

// Sticking to the calorie target against weight loss.
//
// This is the one card that can answer "is the plan wrong, or am I not doing
// it?" — the question every stall turns on. A strong positive here means the
// plan works when it's followed, and the fix is adherence, not a smaller target.
export function adherenceVsLoss(weeks: InsightWeek[]): Correlation | null {
  return correlate(weeks, (w) => w.adherencePct);
}

// --- 11. High-day impact -------------------------------------------------------

export interface HighDayImpact {
  withWeeks: number;
  withoutWeeks: number;
  meanLossWithKg: number; // positive = lost
  meanLossWithoutKg: number;
  differenceKg: number; // with − without; positive = high-day weeks lost more
  verdict: "better" | "worse" | "no-difference";
}

// Both groups need at least this many weeks before the comparison says anything.
export const MIN_WEEKS_PER_GROUP = 2;

// Below this the two groups are the same week wearing different labels.
const MEANINGFUL_DIFFERENCE_KG = 0.1;

// Weeks with high days against weeks without them.
//
// Cycling doesn't change the weekly calorie total by design (see highday.ts),
// so the honest expectation is no difference in loss — the point of high days
// is adherence and training fuel. This card exists to let the user check that
// on their own body rather than take our word for it, and to catch the case
// where high days quietly became extra days.
export function highDayImpact(weeks: InsightWeek[]): HighDayImpact | null {
  const usable = weeks.filter((w) => w.weightChangeKg != null);
  const withHigh = usable.filter((w) => w.highDays > 0);
  const without = usable.filter((w) => w.highDays === 0);
  if (withHigh.length < MIN_WEEKS_PER_GROUP || without.length < MIN_WEEKS_PER_GROUP) {
    return null;
  }

  const lost = (ws: InsightWeek[]) => average(ws.map((w) => -w.weightChangeKg!))!;
  const meanWith = lost(withHigh);
  const meanWithout = lost(without);
  const diff = meanWith - meanWithout;

  return {
    withWeeks: withHigh.length,
    withoutWeeks: without.length,
    meanLossWithKg: round(meanWith, 2),
    meanLossWithoutKg: round(meanWithout, 2),
    differenceKg: round(diff, 2),
    verdict:
      Math.abs(diff) < MEANINGFUL_DIFFERENCE_KG
        ? "no-difference"
        : diff > 0
          ? "better"
          : "worse",
  };
}

// --- 12. This week: days hit, and the logging streak ---------------------------

export interface WeekScorecard {
  weekStart: string;
  daysSoFar: number; // days of the week that have happened
  loggedDays: number;
  kcalHitDays: number;
  proteinHitDays: number;
  streakDays: number; // consecutive days logged, ending today or yesterday
}

// The same ±15% window the coach judges adherence by, so the scorecard and the
// weekly review can never disagree about what "hit it" means.
const KCAL_HIT_TOLERANCE = 0.15;

// Protein is a floor, not a window — going over is fine and often good — so a
// day counts once intake reaches this share of the target.
const PROTEIN_HIT_SHARE = 0.9;

// Consecutive days with any food logged, counted back from today.
//
// Yesterday is allowed to be the last logged day: at 9am today nobody has
// eaten yet, and zeroing a real streak because the day is young is the fastest
// way to make someone stop caring about it.
export function loggingStreak(intake: DayIntake[], today: string): number {
  const logged = new Set(intake.filter((d) => d.kcal > 0).map((d) => d.date));
  const yesterday = addDaysISO(today, -1);
  let cursor = logged.has(today) ? today : logged.has(yesterday) ? yesterday : null;
  if (cursor == null) return 0;

  let streak = 0;
  while (logged.has(cursor)) {
    streak++;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

// How this week is going: days logged, days the calorie target was hit, days
// the protein target was reached, and the streak.
export function weekScorecard(
  intake: DayIntake[],
  target: WeekTarget | null,
  today: string,
): WeekScorecard {
  const weekStart = weekStartOf(today);
  const days = intake.filter((d) => weekStartOf(d.date) === weekStart && d.kcal > 0);
  const daysSoFar =
    Math.round((dayMs(today) - dayMs(weekStart)) / DAY_MS) + 1;

  const kcalHitDays =
    target && target.kcal > 0
      ? days.filter(
          (d) => Math.abs(d.kcal - target.kcal) / target.kcal <= KCAL_HIT_TOLERANCE,
        ).length
      : 0;
  const proteinHitDays =
    target && target.protein_g > 0
      ? days.filter((d) => d.protein_g >= target.protein_g * PROTEIN_HIT_SHARE).length
      : 0;

  return {
    weekStart,
    daysSoFar,
    loggedDays: days.length,
    kcalHitDays,
    proteinHitDays,
    streakDays: loggingStreak(intake, today),
  };
}

export { type WeighIn };
