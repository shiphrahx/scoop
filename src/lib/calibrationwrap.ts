// What the calibration hold taught us about one user's body, as numbers.
//
// The hold ends the moment the app has measured a real burn (see coach.ts), and
// until now that moment was a line of text on Home. It is the first thing the
// user actually achieved: a fortnight of logging bought them a maintenance
// figure measured from their own results instead of a formula's guess, and every
// target from here is built on it. This module turns that fortnight into the
// findings a review screen can show, what was measured, how the body responded,
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
  type MeasurementDoubt,
  type ObservedTdee,
  type WeighIn,
} from "@/lib/coach";
import {
  energyEquivalents,
  habitStats,
  movementStats,
  plateStats,
  sleepStats,
  storageKcal,
  type EnergyEquivalent,
  type HabitStats,
  type MovementStats,
  type PlateStats,
  type SleepStats,
  type WrapFoodLog,
} from "@/lib/wrapstats";
import type { Activity, Macros, Sex } from "@/lib/types";

const DAY_MS = 86_400_000;

// A day counts as "ate the plan" when intake landed within this fraction of the
// target. Matches the coach's own adherence tolerance, the two numbers describe
// the same thing and drifting apart would let the wrap praise a fortnight the
// review had already judged unfollowed.
const ADHERENCE_TOLERANCE = 0.15;

// How far ahead the projection runs. A year is long enough to reach almost any
// goal from almost any start, and short enough that the curve isn't a fantasy,
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
  // Every food log inside it, one row per entry rather than one per day. Only
  // the cards about the plate and the logging habit read these; the metabolism
  // is measured from the daily totals above. Optional, because a review filed
  // before these cards existed has none.
  foodLogs?: WrapFoodLog[];
  // The measurement the hold exists to produce, and the formula's raw guess it
  // is measured against. Either may be null on a thin log.
  observed: ObservedTdee | null;
  predictedTdeeKcal: number | null;
  // Set when the app measured a burn and then set it aside (see trustedTdee).
  // Everything the screen would otherwise say about "your measured maintenance"
  // is off the table, and the honest source for what happens next is the scale.
  measurementDoubt?: MeasurementDoubt | null;
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
  // Standing height, which turns a step count into a distance. Null = no
  // distance card, the steps still get counted.
  heightCm?: number | null;
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

// A fortnight's energy, at a scale a person can picture.
export interface WrapEnergy {
  // Everything the body spent over the hold, and everything that went in. The
  // burn is only quoted from a measurement we stand behind: multiplying a
  // formula's guess by fourteen makes a five figure number that was never
  // measured at all.
  totalBurnKcal: number | null;
  totalIntakeKcal: number | null;
  // What came out of storage, priced from the weight actually lost.
  fromStorageKcal: number | null;
  // Which of the two the comparisons below are drawn from, so the screen can
  // name it rather than leaving the reader to assume.
  basis: "burn" | "intake";
  basisKcal: number;
  equivalents: EnergyEquivalent[];
}

export interface CalibrationWrap {
  // --- The fortnight itself
  days: number; // whole days the hold ran
  loggedDays: number; // days with any food logged
  weighInDays: number; // days with a weight

  // --- What we measured
  measuredMaintenanceKcal: number | null; // from intake vs the scale
  predictedMaintenanceKcal: number | null; // formula, uncalibrated
  // Why there is no measured figure despite a fortnight of data: the log did not
  // account for the plan, or the arithmetic came out below resting metabolism.
  // Null when the measurement stood, and when there was never one to make.
  measurementDoubt: MeasurementDoubt | null;
  maintenanceDeltaKcal: number | null; // measured − predicted (+ = burns more)
  // The share of the burn that isn't resting metabolism: moving, digesting,
  // fidgeting. 0 to 1, null when the resting rate isn't known.
  activeShare: number | null;
  meanStepsPerDay: number | null;
  meanSleepHours: number | null;

  // --- How the fortnight went
  meanIntakeKcal: number | null;
  holdTargetKcal: number;
  adherentDays: number;
  weightChangeKg: number | null; // + = lost over the hold
  // The rate that change came out at, per week. The honest sanity check on the
  // prediction below: a user already losing at the hold's calories is not about
  // to lose LESS on fewer of them, and if the two numbers disagree it is the
  // measurement of their burn that is wrong, not their scale.
  holdLossKgPerWeek: number | null;

  // --- What happens next
  newTarget: Macros;
  // Two different numbers, both true, and showing only the first is what made
  // the screen read as wrong: the deficit is measured against the burn, but what
  // changes on the user's plate is measured against the calories they were told
  // to eat during the hold. Someone held at 1700 who turns out to burn 1810 and
  // is now given 1378 sees a "231 kcal cut" that takes 322 off their day.
  // Null when there is no maintenance figure worth quoting: the measurement was
  // set aside and the new target was not cut from anything, it was held because
  // the scale said it already works.
  deficitKcal: number | null; // measured maintenance − new target
  changeFromHoldKcal: number; // hold target − new target (+ = eating less)
  expectedLossKgPerWeek: number | null;
  // Whether that rate sits inside the healthy band for this body (see
  // healthyLossBand). The band is a fraction of bodyweight, so it needs a weight.
  inHealthyBand: boolean | null;
  projection: WrapProjection | null;

  // --- The fortnight as the user remembers it
  //
  // All optional, and every one of them null when its data never arrived. Two
  // reasons they are not required: a user with no wearable has no steps and no
  // sleep for ever, and a review filed before these existed is replayed from a
  // stored snapshot that cannot grow the fields (see calibration_reviews). The
  // screen drops the card either way.
  movement?: MovementStats | null;
  sleep?: SleepStats | null;
  plate?: PlateStats | null;
  habits?: HabitStats | null;
  energy?: WrapEnergy | null;
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
// so a fixed target is a shrinking deficit and the loss slows, drawing it as a
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

  const foodLogs = inWindow(input.foodLogs ?? []);

  const target = input.holdTargetKcal;
  // Kept as dates rather than a count: the streak card needs to know WHICH days
  // landed on target, not how many did.
  const adherentDates =
    target > 0
      ? intake
          .filter((d) => Math.abs(d.kcal - target) / target <= ADHERENCE_TOLERANCE)
          .map((d) => d.date)
      : [];

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
    totalIntakeKcal: intake.reduce((sum, d) => sum + d.kcal, 0),
    loggedDates: intake.map((d) => d.date),
    adherentDates,
    adherentDays: adherentDates.length,
    activity,
    foodLogs,
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

  const doubt = input.measurementDoubt ?? null;
  const trusted = doubt == null;

  const measured = input.observed?.kcalPerDay ?? null;
  const predicted =
    input.predictedTdeeKcal != null && input.predictedTdeeKcal > 0
      ? input.predictedTdeeKcal
      : null;

  // What the burn is made of. The resting rate is the floor of it; everything
  // above is movement, the part the user controls day to day.
  //
  // Only from a burn we stand behind. With the measurement set aside the only
  // figure left is the formula's, and splitting a guess into resting and moving
  // dresses it up as something this fortnight measured.
  const burn = measured ?? (input.maintenanceKcal > 0 ? input.maintenanceKcal : null);
  const activeShare =
    trusted &&
    burn != null &&
    input.restingRateKcal != null &&
    input.restingRateKcal > 0 &&
    burn > 0
      ? Math.max(0, Math.min(1, (burn - input.restingRateKcal) / burn))
      : null;

  const changeFromHoldKcal = Math.round(input.holdTargetKcal - input.newTarget.kcal);
  const holdLossKgPerWeek =
    window.weightChangeKg != null && days >= 7
      ? (window.weightChangeKg * 7) / days
      : null;

  // Where the numbers for "what happens next" come from.
  //
  // With a measurement we trust, the deficit is the gap between the burn and the
  // new target, and the rate follows from it. With the measurement set aside
  // there is no burn figure to subtract from, and using the formula's guess would
  // put a number on the screen the target was not built from. So read it the way
  // the coach did: off the scale.
  //
  // The rate the user was ALREADY losing at, plus whatever the new target takes
  // off the plate on top of it. Hold the target and the answer is simply the rate
  // they were already losing at, which is the only honest prediction available
  // and the one their own fortnight supports.
  const deficitKcal = trusted
    ? Math.round(input.maintenanceKcal - input.newTarget.kcal)
    : changeFromHoldKcal > 0
      ? changeFromHoldKcal
      : null;
  const expectedLossKgPerWeek = (() => {
    if (trusted) {
      return deficitKcal != null && deficitKcal > 0
        ? (deficitKcal * 7) / KCAL_PER_KG
        : null;
    }
    const fromScale = holdLossKgPerWeek != null && holdLossKgPerWeek > 0 ? holdLossKgPerWeek : 0;
    const fromCut = deficitKcal != null ? (deficitKcal * 7) / KCAL_PER_KG : 0;
    const rate = fromScale + fromCut;
    return rate > 0 ? rate : null;
  })();

  const band = healthyLossBand(input.sex, input.bodyFatPct);
  const inHealthyBand =
    expectedLossKgPerWeek != null && input.weightKg != null && input.weightKg > 0
      ? expectedLossKgPerWeek / input.weightKg >= band.min &&
        expectedLossKgPerWeek / input.weightKg <= band.max
      : null;

  // The curve has to start from the same rate the card above it promises, so on
  // the untrusted path maintenance is back-derived from that rate rather than
  // taken from the formula. The projection still flattens as the body lightens.
  const projectFromKcal = trusted
    ? input.maintenanceKcal
    : expectedLossKgPerWeek != null
      ? input.newTarget.kcal + (expectedLossKgPerWeek * KCAL_PER_KG) / 7
      : input.newTarget.kcal;

  const projection =
    input.weightKg != null && input.weightKg > 0
      ? projectWeeks({
          startKg: input.weightKg,
          maintenanceKcal: projectFromKcal,
          targetKcal: input.newTarget.kcal,
          goalKg: input.goalWeightKg,
          from: now,
        })
      : null;

  // --- The fortnight as the user remembers it
  //
  // None of this feeds a target. It is measured from the same window as
  // everything above so the two halves of the screen cannot disagree about which
  // fourteen days are being talked about.
  const movement = movementStats(window.activity, {
    heightCm: input.heightCm ?? null,
    sex: input.sex,
  });
  const sleep = sleepStats(window.activity);
  const plate = plateStats(window.foodLogs);
  const habits = habitStats({
    logs: window.foodLogs,
    loggedDates: window.loggedDates,
    onTargetDates: window.adherentDates,
  });

  // The energy total, and what it looks like next to something real.
  //
  // The burn is only totalled from a measurement we stand behind. Where there
  // isn't one the honest headline is the food they logged, which is a count of
  // what they did rather than a claim about their body.
  const energy = ((): WrapEnergy | null => {
    const totalBurnKcal = trusted && measured != null ? Math.round(measured * days) : null;
    const totalIntakeKcal =
      window.totalIntakeKcal > 0 ? Math.round(window.totalIntakeKcal) : null;
    const basisKcal = totalBurnKcal ?? totalIntakeKcal ?? 0;
    if (basisKcal <= 0) return null;
    return {
      totalBurnKcal,
      totalIntakeKcal,
      fromStorageKcal: storageKcal(window.weightChangeKg),
      basis: totalBurnKcal != null ? "burn" : "intake",
      basisKcal,
      equivalents: energyEquivalents(basisKcal, {
        weightKg: input.weightKg,
        topFood: plate?.topFood ?? null,
      }),
    };
  })();

  return {
    days,
    loggedDays: window.loggedDays,
    weighInDays: window.weighInDays,
    measuredMaintenanceKcal: measured != null ? Math.round(measured) : null,
    predictedMaintenanceKcal: predicted != null ? Math.round(predicted) : null,
    maintenanceDeltaKcal:
      measured != null && predicted != null ? Math.round(measured - predicted) : null,
    measurementDoubt: doubt,
    activeShare,
    meanStepsPerDay: window.meanStepsPerDay,
    meanSleepHours: window.meanSleepHours,
    meanIntakeKcal: window.meanIntakeKcal,
    holdTargetKcal: Math.round(input.holdTargetKcal),
    adherentDays: window.adherentDays,
    weightChangeKg: window.weightChangeKg,
    holdLossKgPerWeek,
    newTarget: input.newTarget,
    deficitKcal,
    changeFromHoldKcal,
    expectedLossKgPerWeek,
    inHealthyBand,
    projection,
    movement,
    sleep,
    plate,
    habits,
    energy,
  };
}
