// The parts of a calibration fortnight that are not a measurement of the user's
// metabolism: how far they walked, how they slept, what actually went on the
// plate, and how consistently they logged it.
//
// calibrationwrap.ts answers "what does this body do with food". This module
// answers "what did this fortnight look like", the numbers a user recognises as
// their own two weeks rather than as a finding about their physiology. Kept
// apart because they fail differently: a missing burn figure is a hole in the
// coaching, a missing step count is just a card that doesn't appear.
//
// Pure and deterministic. Every function returns null rather than a zero when
// the data it needs is absent, so the screen can drop a card instead of
// printing "0 km walked" at someone who never connected a watch.

import { KCAL_PER_KG } from "@/lib/coach";
import type { Activity, Sex } from "@/lib/types";

const DAY_MS = 86_400_000;

// --- Small shared helpers ----------------------------------------------------

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Whether `b` is the calendar day straight after `a`. Compared as UTC midnights
// because the dates arriving here are already local YYYY-MM-DD strings: they
// have had a timezone applied once, and applying a second one would move them.
function isNextDay(a: string, b: string): boolean {
  const from = Date.parse(`${a}T00:00:00Z`);
  const to = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  return to - from === DAY_MS;
}

// The longest run of consecutive calendar days in a set of dates.
//
// Deliberately the longest run inside the window rather than the run ending
// today: this is a record of a fortnight that has already finished, and the
// user's best stretch of it does not stop counting because the last day slipped.
export function longestRun(dates: string[]): number {
  const days = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && isNextDay(days[i - 1], days[i]) ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

// --- Movement ----------------------------------------------------------------

// Stride length as a fraction of standing height, the usual anthropometric
// figures. The two sexes are barely a centimetre apart at any real height, far
// inside the error of a wrist step count, but both are kept rather than averaged
// so the number is derived rather than fudged.
const STRIDE_FRACTION: Record<Sex, number> = { male: 0.415, female: 0.413 };

// Stride assumed when height is unknown. Matches the 0.75 m in coach.ts's step
// model, so the distance shown here and the energy charged for it there are
// talking about the same walking.
export const DEFAULT_STRIDE_M = 0.75;

export function strideMetres(heightCm: number | null, sex: Sex): number {
  if (heightCm == null || !(heightCm > 0)) return DEFAULT_STRIDE_M;
  return (heightCm * STRIDE_FRACTION[sex]) / 100;
}

export interface MovementStats {
  // Days that carried a step count, which is not the same as days in the hold.
  days: number;
  totalSteps: number;
  distanceKm: number;
  meanStepsPerDay: number;
  // The best single day, and the median the streak below is measured against.
  bestDay: { date: string; steps: number } | null;
  medianSteps: number;
  // Longest run of consecutive days at or above that median. A personal bar
  // rather than the usual 10,000: the point is that they kept their own pace up,
  // and a fixed target would either be free or unreachable depending on the user.
  streakDays: number;
  // Everything a watch called a workout, summed over the hold.
  workoutKcal: number;
}

export function movementStats(
  activity: Activity[],
  opts: { heightCm: number | null; sex: Sex },
): MovementStats | null {
  // Zero-step days are days the phone stayed on the table, not days spent
  // motionless. Left out of every figure here, same as the coach does.
  const stepDays = activity
    .filter((a) => a.steps != null && a.steps > 0)
    .map((a) => ({ date: a.date, steps: Number(a.steps) }));
  const workoutKcal = activity.reduce(
    (sum, a) => sum + (a.workout_kcal != null && a.workout_kcal > 0 ? Number(a.workout_kcal) : 0),
    0,
  );

  if (stepDays.length === 0) return null;

  const totalSteps = stepDays.reduce((sum, d) => sum + d.steps, 0);
  const med = median(stepDays.map((d) => d.steps)) ?? 0;
  const above = stepDays.filter((d) => d.steps >= med).map((d) => d.date);
  const best = stepDays.reduce((top, d) => (d.steps > top.steps ? d : top), stepDays[0]);

  return {
    days: stepDays.length,
    totalSteps,
    distanceKm: (totalSteps * strideMetres(opts.heightCm, opts.sex)) / 1000,
    meanStepsPerDay: totalSteps / stepDays.length,
    bestDay: best,
    medianSteps: med,
    streakDays: longestRun(above),
    workoutKcal: Math.round(workoutKcal),
  };
}

// --- Sleep -------------------------------------------------------------------

export interface SleepStats {
  nights: number;
  totalHours: number;
  meanHours: number;
  bestNight: { date: string; hours: number } | null;
}

export function sleepStats(activity: Activity[]): SleepStats | null {
  const nights = activity
    .filter((a) => a.sleep_hours != null && a.sleep_hours > 0)
    .map((a) => ({ date: a.date, hours: Number(a.sleep_hours) }));
  if (nights.length === 0) return null;

  const totalHours = nights.reduce((sum, n) => sum + n.hours, 0);
  return {
    nights: nights.length,
    totalHours,
    meanHours: totalHours / nights.length,
    bestNight: nights.reduce((top, n) => (n.hours > top.hours ? n : top), nights[0]),
  };
}

// --- What went on the plate --------------------------------------------------

// One food log, reduced to what the review needs: which local day and hour it
// landed on, what it was, and how it got there.
export interface WrapFoodLog {
  date: string; // YYYY-MM-DD in the user's zone
  hour: number; // 0 to 23, their clock
  name: string;
  source: string; // batch | barcode | recipe | manual | alcohol
  kcal: number;
  protein_g: number;
  grams: number | null;
}

export interface TopFood {
  name: string;
  count: number;
  // What one of them came to on average, which is what makes it usable as a
  // unit of energy further down ("that burn is 61 of these").
  meanKcal: number;
}

export interface PlateStats {
  logs: number;
  distinctFoods: number;
  // Only rows that carry a weight. A pint and a portion of soup are logged
  // without grams, so this is the weighed part of the fortnight, not all of it.
  totalGrams: number;
  weighedLogs: number;
  totalProteinG: number;
  topFood: TopFood | null;
  alcoholKcal: number;
}

// Names are grouped case and whitespace insensitively, so "Porridge" and
// "porridge " are one food. The label kept is the first spelling seen, because
// it is the user's own and correcting it would make the card read as someone
// else's list.
function normalise(name: string): string {
  return name.trim().toLowerCase();
}

export function plateStats(logs: WrapFoodLog[]): PlateStats | null {
  if (logs.length === 0) return null;

  const byName = new Map<string, { name: string; count: number; kcal: number }>();
  let totalGrams = 0;
  let weighedLogs = 0;
  let totalProteinG = 0;
  let alcoholKcal = 0;

  for (const log of logs) {
    const key = normalise(log.name);
    const seen = byName.get(key) ?? { name: log.name.trim(), count: 0, kcal: 0 };
    seen.count += 1;
    seen.kcal += log.kcal;
    byName.set(key, seen);

    if (log.grams != null && log.grams > 0) {
      totalGrams += log.grams;
      weighedLogs += 1;
    }
    totalProteinG += log.protein_g;
    if (log.source === "alcohol") alcoholKcal += log.kcal;
  }

  // Ties broken by calories, so "the thing you ate most" is the one that shaped
  // the fortnight rather than whichever name sorted first.
  const ranked = [...byName.values()].sort(
    (a, b) => b.count - a.count || b.kcal - a.kcal,
  );
  const top = ranked[0];

  return {
    logs: logs.length,
    distinctFoods: byName.size,
    totalGrams,
    weighedLogs,
    totalProteinG,
    // One log of one food is not a habit, it is the only thing in the list.
    topFood:
      top && top.count > 1
        ? { name: top.name, count: top.count, meanKcal: top.kcal / top.count }
        : null,
    alcoholKcal,
  };
}

// --- How it was logged -------------------------------------------------------

export interface HabitStats {
  logs: number;
  // Consecutive days with any food on them, and consecutive days that landed
  // inside the adherence tolerance. Both the best run in the window.
  longestLogStreak: number;
  longestOnTargetStreak: number;
  // The hour the last log of the day usually falls on, taken as the median of
  // each day's last entry so one late night doesn't become the finding. Logs
  // after midnight belong to the next day here, the same way the food log books
  // them, so a 1am snack reads as an early hour rather than a late one.
  lastLogHour: number | null;
  busiestHour: number | null;
  // Logs that came from a scan, a batch, a saved meal or a recipe: everything
  // the user did not type out by hand. The app's whole premise is tapping rather
  // than typing, and this is the only place it gets measured.
  oneTapLogs: number;
}

export function habitStats(input: {
  logs: WrapFoodLog[];
  loggedDates: string[];
  onTargetDates: string[];
}): HabitStats | null {
  const { logs } = input;
  const longestLogStreak = longestRun(input.loggedDates);
  const longestOnTargetStreak = longestRun(input.onTargetDates);
  if (logs.length === 0 && longestLogStreak === 0) return null;

  const lastByDay = new Map<string, number>();
  const byHour = new Map<number, number>();
  for (const log of logs) {
    const prev = lastByDay.get(log.date);
    if (prev == null || log.hour > prev) lastByDay.set(log.date, log.hour);
    byHour.set(log.hour, (byHour.get(log.hour) ?? 0) + 1);
  }

  const busiest = [...byHour.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const lastHour = median([...lastByDay.values()]);

  return {
    logs: logs.length,
    longestLogStreak,
    longestOnTargetStreak,
    lastLogHour: lastHour != null ? Math.round(lastHour) : null,
    busiestHour: busiest ? busiest[0] : null,
    oneTapLogs: logs.filter((l) => l.source !== "manual").length,
  };
}

// --- Energy at human scale ---------------------------------------------------

// A fortnight's burn is a five figure number, which means nothing to anyone.
// These put it beside something a person can picture.
//
// Deliberately brand free. Naming a burger chain would date the app, put someone
// else's trademark in our UI, and turn a measurement into a joke about junk
// food, which is not the tone the rest of the review takes. Physics and the
// user's own food log do the same job without any of that.

// Bringing a litre of water from room temperature to the boil: 80 degrees of
// rise, and a kilocalorie is by definition one degree per kilogram of water.
export const KCAL_PER_LITRE_BOILED = 80;

// Gross cost of walking a kilometre, per kg of bodyweight. About 1 kcal/kg/km
// gross, of which roughly half is the resting metabolism that would have been
// spent anyway, so 0.5 is the honest figure for "energy this would carry you".
export const KCAL_PER_KM_PER_KG = 0.5;

export interface EnergyEquivalent {
  key: "food" | "walk" | "boil";
  count: number;
  // Plural noun for the count. The screen writes "24,000 kcal, about 61
  // servings of porridge", so this has to read straight after a number.
  unit: string;
}

// The same energy expressed three ways, most personal first.
export function energyEquivalents(
  kcal: number,
  opts: { weightKg: number | null; topFood: TopFood | null },
): EnergyEquivalent[] {
  if (!(kcal > 0)) return [];
  const out: EnergyEquivalent[] = [];

  // The user's own most-logged food, which beats any reference item: they know
  // exactly how big one is, because they ate a fortnight of them.
  if (opts.topFood != null && opts.topFood.meanKcal > 0) {
    const count = Math.round(kcal / opts.topFood.meanKcal);
    if (count > 0) out.push({ key: "food", count, unit: `servings of ${opts.topFood.name}` });
  }

  if (opts.weightKg != null && opts.weightKg > 0) {
    const count = Math.round(kcal / (KCAL_PER_KM_PER_KG * opts.weightKg));
    if (count > 0) out.push({ key: "walk", count, unit: "km of walking" });
  }

  const litres = Math.round(kcal / KCAL_PER_LITRE_BOILED);
  if (litres > 0) out.push({ key: "boil", count: litres, unit: "litres of water boiled" });

  return out;
}

// Energy the body took out of storage over the hold, from the weight it lost.
// Null when the scale did not move down: there is no store to draw on when the
// weight held or rose, and the arithmetic would print a negative.
export function storageKcal(weightChangeKg: number | null): number | null {
  if (weightChangeKg == null || weightChangeKg <= 0) return null;
  return Math.round(weightChangeKg * KCAL_PER_KG);
}
