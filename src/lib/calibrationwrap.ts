// What the calibration hold taught us about one user's body, as numbers.
//
// The hold ends the moment the app has measured a real burn (see coach.ts), and
// until now that moment was a line of text on Home. It is the first thing the
// user actually achieved: a fortnight of logging bought them a maintenance
// figure measured from their own results instead of a formula's guess, and every
// target from here is built on it. This module turns that fortnight into the
// findings a review screen can show — what was measured, how the body responded,
// what the new target is, and where it leads if they eat it.
//
// Pure and deterministic: no database, no clock beyond what the caller passes.
// The screen only renders what it's handed, so all the arithmetic is testable.

import {
  KCAL_PER_KG,
  average,
  healthyLossBand,
  weightSlopeKgPerDay,
  type DailyIntake,
  type ObservedTdee,
  type WeighIn,
} from "@/lib/coach";
import type { Activity, Macros, Sex } from "@/lib/types";

const DAY_MS = 86_400_000;

// A day counts as "ate the plan" when intake landed within this fraction of the
// target. Matches the coach's own adherence tolerance — the two numbers describe
// the same thing and drifting apart would let the wrap praise a fortnight the
// review had already judged unfollowed.
const ADHERENCE_TOLERANCE = 0.15;

// How far ahead the projection runs. A year is long enough to reach almost any
// goal from almost any start, and short enough that the curve isn't a fantasy —
// it is capped again by the honesty note the screen shows alongside it.
export const MAX_PROJECTION_WEEKS = 52;

export interface WrapInput {
  // When the hold opened, and when we are looking at it.
  startedAt: string;
  now?: Date;
  // Everything logged inside the hold.
  weighIns: WeighIn[];
  intake: DailyIntake[];
  activity: Activity[];
  // The measurement the hold exists to produce, and the formula's raw guess it
  // is measured against. Either may be null on a thin log.
  observed: ObservedTdee | null;
  predictedTdeeKcal: number | null;
  // What the user was told to eat during the hold, and the maintenance estimate
  // the graduating target is built from (measured where possible).
  holdTargetKcal: number;
  maintenanceKcal: number;
  // The target that starts when they press the button, and the body it's for.
  newTarget: Macros;
  weightKg: number | null;
  goalWeightKg: number | null;
  sex: Sex;
  bodyFatPct: number | null;
  // This user's resting metabolism, so the burn can be split into what they burn
  // lying still and what they burn moving. Null = no split shown.
  restingRateKcal: number | null;
}

// One week of the projection: how much the user weighs at the end of it if they
// eat the new target.
export interface ProjectionPoint {
  week: number; // 0 = today
  kg: number;
}

export interface WrapProjection {
  points: ProjectionPoint[];
  // Weeks until the goal weight is reached, and the date that lands on. Null
  // when there's no goal, or the goal isn't reached inside the horizon.
  goalWeeks: number | null;
  goalDate: string | null;
}

export interface CalibrationWrap {
  // --- The fortnight itself
  days: number; // whole days the hold ran
  loggedDays: number; // days with any food logged
  weighInDays: number; // days with a weight

  // --- What we measured
  measuredMaintenanceKcal: number | null; // from intake vs the scale
  predictedMaintenanceKcal: number | null; // formula, uncalibrated
  maintenanceDeltaKcal: number | null; // measured − predicted (+ = burns more)
  // The share of the burn that isn't resting metabolism: moving, digesting,
  // fidgeting. 0–1, null when the resting rate isn't known.
  activeShare: number | null;
  meanStepsPerDay: number | null;
  meanSleepHours: number | null;

  // --- How the fortnight went
  meanIntakeKcal: number | null;
  holdTargetKcal: number;
  adherentDays: number;
  weightChangeKg: number | null; // + = lost over the hold

  // --- What happens next
  newTarget: Macros;
  deficitKcal: number; // maintenance − new target
  expectedLossKgPerWeek: number | null;
  // Whether that rate sits inside the healthy band for this body (see
  // healthyLossBand). The band is a fraction of bodyweight, so it needs a weight.
  inHealthyBand: boolean | null;
  projection: WrapProjection | null;
}

// Whole days the hold has been open. Never negative.
export function holdDays(startedAt: string, now: Date): number {
  const ms = now.getTime() - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / DAY_MS);
}

// Weight at the end of each week if the user eats `targetKcal` every day.
//
// Not a straight line. Maintenance falls as the body it belongs to gets lighter,
// so a fixed target is a shrinking deficit and the loss slows — drawing it as a
// constant rate promises a goal date the user will miss by weeks. Maintenance is
// scaled with bodyweight, which is the simple form of that effect and errs on
// the honest side.
export function projectWeeks(input: {
  startKg: number;
  maintenanceKcal: number;
  targetKcal: number;
  goalKg: number | null;
  maxWeeks?: number;
  from?: Date;
}): WrapProjection {
  const { startKg, maintenanceKcal, targetKcal, goalKg } = input;
  const maxWeeks = input.maxWeeks ?? MAX_PROJECTION_WEEKS;
  const from = input.from ?? new Date();

  const points: ProjectionPoint[] = [{ week: 0, kg: startKg }];
  if (!(startKg > 0) || !(maintenanceKcal > 0) || !(targetKcal > 0)) {
    return { points, goalWeeks: null, goalDate: null };
  }

  let kg = startKg;
  let goalWeeks: number | null = null;
  for (let week = 1; week <= maxWeeks; week++) {
    const maintenanceNow = maintenanceKcal * (kg / startKg);
    const lossKg = ((maintenanceNow - targetKcal) * 7) / KCAL_PER_KG;
    // A target at or above maintenance never reaches a lower goal; stop rather
    // than draw a flat line to the horizon.
    if (lossKg <= 0) break;
    kg = kg - lossKg;
    points.push({ week, kg });
    if (goalKg != null && goalWeeks == null && kg <= goalKg) {
      goalWeeks = week;
      break;
    }
  }

  const goalDate =
    goalWeeks != null
      ? new Date(from.getTime() + goalWeeks * 7 * DAY_MS).toISOString().slice(0, 10)
      : null;
  return { points, goalWeeks, goalDate };
}

// How much of the hold the user actually logged, and how closely they ate it.
function fortnight(input: WrapInput, days: number) {
  const from = new Date(Date.parse(input.startedAt)).toISOString().slice(0, 10);
  const inWindow = <T extends { date: string }>(rows: T[]) =>
    rows.filter((r) => r.date >= from);

  const intake = inWindow(input.intake).filter((d) => d.kcal > 0);
  const weighIns = inWindow(input.weighIns).filter(
    (w) => Number.isFinite(w.kg) && w.kg > 0,
  );
  const activity = inWindow(input.activity);

  const target = input.holdTargetKcal;
  const adherentDays =
    target > 0
      ? intake.filter((d) => Math.abs(d.kcal - target) / target <= ADHERENCE_TOLERANCE)
          .length
      : 0;

  // Movement over the hold. Zero-step days are days the phone wasn't carried,
  // not days spent motionless, so they're left out rather than averaged in.
  const steps = activity
    .map((a) => a.steps)
    .filter((s): s is number => s != null && s > 0);
  const sleep = activity
    .map((a) => a.sleep_hours)
    .filter((h): h is number => h != null && h > 0);

  return {
    days,
    loggedDays: intake.length,
    weighInDays: weighIns.length,
    meanIntakeKcal: average(intake.map((d) => d.kcal)),
    adherentDays,
    meanStepsPerDay: average(steps),
    meanSleepHours: average(sleep),
    // The scale's own answer for the window: the regression slope across it, not
    // the gap between two weigh-ins, so one heavy Sunday doesn't become the
    // finding. Positive = lost.
    weightChangeKg: (() => {
      const slope = weightSlopeKgPerDay(weighIns);
      if (slope == null || days <= 0) return null;
      return -slope * days;
    })(),
  };
}

// Everything the review screen shows, from one hold's worth of data.
export function calibrationWrap(input: WrapInput): CalibrationWrap {
  const now = input.now ?? new Date();
  const days = holdDays(input.startedAt, now);
  const window = fortnight(input, days);

  const measured = input.observed?.kcalPerDay ?? null;
  const predicted =
    input.predictedTdeeKcal != null && input.predictedTdeeKcal > 0
      ? input.predictedTdeeKcal
      : null;

  // What the burn is made of. The resting rate is the floor of it; everything
  // above is movement — the part the user controls day to day.
  const burn = measured ?? (input.maintenanceKcal > 0 ? input.maintenanceKcal : null);
  const activeShare =
    burn != null && input.restingRateKcal != null && input.restingRateKcal > 0 && burn > 0
      ? Math.max(0, Math.min(1, (burn - input.restingRateKcal) / burn))
      : null;

  const deficitKcal = Math.round(input.maintenanceKcal - input.newTarget.kcal);
  const expectedLossKgPerWeek =
    deficitKcal > 0 ? (deficitKcal * 7) / KCAL_PER_KG : null;

  const band = healthyLossBand(input.sex, input.bodyFatPct);
  const inHealthyBand =
    expectedLossKgPerWeek != null && input.weightKg != null && input.weightKg > 0
      ? expectedLossKgPerWeek / input.weightKg >= band.min &&
        expectedLossKgPerWeek / input.weightKg <= band.max
      : null;

  const projection =
    input.weightKg != null && input.weightKg > 0
      ? projectWeeks({
          startKg: input.weightKg,
          maintenanceKcal: input.maintenanceKcal,
          targetKcal: input.newTarget.kcal,
          goalKg: input.goalWeightKg,
          from: now,
        })
      : null;

  return {
    days,
    loggedDays: window.loggedDays,
    weighInDays: window.weighInDays,
    measuredMaintenanceKcal: measured != null ? Math.round(measured) : null,
    predictedMaintenanceKcal: predicted != null ? Math.round(predicted) : null,
    maintenanceDeltaKcal:
      measured != null && predicted != null ? Math.round(measured - predicted) : null,
    activeShare,
    meanStepsPerDay: window.meanStepsPerDay,
    meanSleepHours: window.meanSleepHours,
    meanIntakeKcal: window.meanIntakeKcal,
    holdTargetKcal: Math.round(input.holdTargetKcal),
    adherentDays: window.adherentDays,
    weightChangeKg: window.weightChangeKg,
    newTarget: input.newTarget,
    deficitKcal,
    expectedLossKgPerWeek,
    inHealthyBand,
    projection,
  };
}
