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
import type { Sex } from "@/lib/types";

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

export { type WeighIn };
