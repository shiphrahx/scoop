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

export { type WeighIn };
