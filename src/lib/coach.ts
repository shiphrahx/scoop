import type {
  ActivityLevel,
  DietType,
  GoalPace,
  Macros,
  Sex,
} from "@/lib/types";

export type { Macros } from "@/lib/types";

// The Coach math — pure functions, no AI. Mifflin–St Jeor BMR + activity
// multiplier = TDEE, minus a deficit for weight loss, split into macros.

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Thermic effect of food: digesting a mixed diet costs about 10% of what's
// eaten. The activity multipliers below already bake this in, but a TDEE built
// from measured components has to add it back explicitly.
const TEF_FRACTION = 0.1;

// How fast each pace aims to lose, in kg/week. The calorie deficit is derived
// from this rate (not a flat % of TDEE) so the number the user picks in
// onboarding is the number the maths actually targets — see dailyTarget.
const PACE_KG_PER_WEEK: Record<GoalPace, number> = {
  gentle: 0.25,
  steady: 0.5,
  aggressive: 0.75,
};

// Energy in 1 kg of body fat (≈ 3500 kcal/lb). Standard clinical heuristic for
// turning a target loss rate into a daily calorie deficit.
const KCAL_PER_KG = 7700;

// Never prescribe a loss faster than 1% of bodyweight/week — beyond that the
// deficit starts costing muscle. Caps the requested rate for light people.
const MAX_WEEKLY_LOSS_FRACTION = 0.01;

// Absolute floors, below which no target is ever issued.
const MIN_KCAL: Record<Sex, number> = {
  male: 1500,
  female: 1200,
};

// No deficit may exceed this share of maintenance. The rate cap alone doesn't
// bound it: someone heavy with a low burn can be prescribed 1% of bodyweight a
// week and find that's 45% of everything they expend.
const MAX_DEFICIT_FRACTION = 0.3;

// The real floor for a given person, not just for their sex.
//
// A flat 1200 is not a floor, it's a number. For a 100 kg woman whose resting
// metabolism alone is 1650 it prescribes a >50% deficit — the exact territory
// where muscle goes, hormones follow and adherence collapses. Sustained eating
// below resting rate is what the floor exists to prevent, so make the floor say
// that.
export function kcalFloor(sex: Sex, rmrKcal?: number | null): number {
  const absolute = MIN_KCAL[sex];
  if (rmrKcal == null || !(rmrKcal > 0)) return absolute;
  return Math.max(absolute, Math.round(rmrKcal));
}

// A healthy weekly loss, as a fraction of bodyweight, for this person.
//
// The old flat 0.5–1.0% band ignored the body-fat reading the app already
// collects. That band is fine at 30% body fat, where there is plenty of fat to
// draw on. At 12% it is a prescription for losing muscle: the leaner someone
// is, the smaller the share of a deficit that fat can supply, and the slower
// they have to go.
export function healthyLossBand(
  sex: Sex,
  bodyFatPct?: number | null,
): { min: number; max: number } {
  if (bodyFatPct == null || !(bodyFatPct > 0)) return { min: 0.005, max: 0.01 };

  // Women carry more essential fat, so the same caution arrives ~10 points higher.
  const lean = sex === "male" ? 15 : 25;
  const ample = sex === "male" ? 25 : 35;

  if (bodyFatPct < lean) return { min: 0.0025, max: 0.005 };
  if (bodyFatPct < ample) return { min: 0.005, max: 0.0075 };
  return { min: 0.005, max: 0.01 };
}

const PROTEIN_G_PER_KG = 2.0; // high protein to protect muscle in a deficit
const FAT_FRACTION_OF_KCAL = 0.25;
// Hormone and fat-soluble-vitamin floor. Applies to every diet, keto included.
const MIN_FAT_G_PER_KG = 0.6;
// …but the floor itself can never claim more than this share of the day, or a
// very small target would be all fat and no protein.
const MAX_FAT_SHARE_FOR_FLOOR = 0.4;
const KETO_CARBS_G = 25; // hard carb ceiling on a ketogenic split; fat fills the rest
const HEALTHY_BMI_MAX = 25; // top of the healthy BMI band; caps the protein basis

// Protein is prescribed per kg of bodyweight, but for someone well above a
// healthy weight that overshoots — surplus fat mass doesn't need feeding, and
// the evidence bases protein on lean/target weight. Cap the basis at a target
// weight: the user's own goal weight when they gave one, otherwise the weight
// that puts them at BMI 25 for their height (a stand-in for target weight).
// No target and no height → no cap (used by the result-based weekly review).
export function proteinBasisKg(
  weightKg: number,
  heightCm?: number,
  goalWeightKg?: number | null,
): number {
  const targetKg =
    goalWeightKg != null && goalWeightKg > 0
      ? goalWeightKg
      : heightCm != null
        ? HEALTHY_BMI_MAX * (heightCm / 100) ** 2
        : null;
  if (targetKg == null) return weightKg;
  return Math.min(weightKg, targetKg);
}

export interface CoachInput {
  sex: Sex;
  diet: DietType;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  pace: GoalPace;
  // Measured average daily ACTIVE energy (kcal) from Fitbit/Apple — everything
  // burned above resting, which is all movement, not just workouts. Fitbit's
  // activityCalories and Apple's active_energy both mean this. When present it
  // replaces the self-reported activity multiplier with real data.
  activeKcalPerDay?: number | null;
  // Average daily step count. Used when no device reports calories — a rough
  // measurement of this week beats a self-description chosen at onboarding.
  stepsPerDay?: number | null;
  // Body-fat fraction as a percentage (e.g. 22 for 22%). Optional — when known
  // the resting rate switches to Katch–McArdle (driven by lean mass), which is
  // more accurate than Mifflin for both lean and very-heavy bodies.
  bodyFatPct?: number | null;
  // The user's target weight, if set. Caps the protein basis (see proteinBasisKg).
  goalWeightKg?: number | null;
  // Ratio between the burn this user actually shows and the one the formula
  // predicts, learned from intake against trend weight (see observeTdee). 1 (or
  // absent) means we have no measurement yet and the prediction stands alone.
  tdeeCalibration?: number | null;
}

// Mifflin–St Jeor basal metabolic rate (kcal/day). The default when we have no
// body-composition data — the best-validated equation for the general population.
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

// Katch–McArdle basal metabolic rate (kcal/day) from lean body mass. Resting
// metabolism tracks lean mass, not total weight, so when body-fat % is known
// this beats Mifflin — it doesn't over- or under-count fat mass.
export function bmrKatch(weightKg: number, bodyFatPct: number) {
  const leanKg = weightKg * (1 - bodyFatPct / 100);
  return 370 + 21.6 * leanKg;
}

// The resting metabolic rate to build TDEE from: Katch–McArdle when we have a
// body-fat reading, Mifflin–St Jeor otherwise.
export function restingRate(input: Pick<CoachInput, "sex" | "weightKg" | "heightCm" | "age" | "bodyFatPct">) {
  if (input.bodyFatPct != null && input.bodyFatPct > 0) {
    return bmrKatch(input.weightKg, input.bodyFatPct);
  }
  return bmr(input.sex, input.weightKg, input.heightCm, input.age);
}

// Build a TDEE out of measured parts: resting rate + active energy + the
// thermic effect of food. At maintenance intake equals TDEE, so
//   TDEE = rmr + active + 0.10 × TDEE  →  TDEE = (rmr + active) / 0.9.
export function tdeeFromComponents(rmrKcal: number, activeKcal: number) {
  return (rmrKcal + activeKcal) / (1 - TEF_FRACTION);
}

// Total daily energy expenditure. With measured active energy from a device we
// build it from real components; otherwise we fall back to the self-reported
// activity factor.
//
// The device figure covers ALL movement — walking to the shops as much as the
// gym — so it must sit on top of the bare resting rate. Putting it on top of a
// 1.2 "sedentary" baseline (as this used to) counts everyday activity twice and
// inflates the target by roughly 0.2 × RMR, some 250–400 kcal/day: enough to
// swallow most of the deficit the user asked for.
// The calibration factor is applied last, on top of whichever route produced
// the prediction: it is the standing correction between this user's real burn
// and the textbook's guess at it, and it survives every profile edit.
export function tdee(input: Omit<CoachInput, "pace">) {
  const rmr = restingRate(input);

  // Best available answer first: a device that reports calories, then a step
  // count, then the user's own guess at how active they are. A step count is
  // rough, but it is a measurement of this week rather than a description the
  // user chose once at onboarding and never revisited.
  let predicted: number;
  if (input.activeKcalPerDay != null && input.activeKcalPerDay > 0) {
    predicted = tdeeFromComponents(rmr, input.activeKcalPerDay);
  } else if (input.stepsPerDay != null && input.stepsPerDay > 0) {
    predicted = tdeeFromComponents(
      rmr,
      activeKcalFromSteps(input.stepsPerDay, input.weightKg, rmr),
    );
  } else {
    predicted = rmr * ACTIVITY_MULTIPLIER[input.activity];
  }

  const cal = input.tdeeCalibration;
  return cal != null && cal > 0 ? predicted * cal : predicted;
}

export function ageFromBirthYear(birthYear: number, now = new Date()) {
  return now.getFullYear() - birthYear;
}

// How many of the window's days must carry a device reading before we trust the
// average. Below this the week is too patchy to describe the user's activity.
const MIN_ACTIVE_COVERAGE = 5;

// Average daily active energy over a window, or null when the device data is
// too sparse to believe.
//
// Averaging only the days that reported a burn is a trap: three synced days out
// of seven then get divided by three, so a part-synced week reads as if every
// day were a training day and TDEE comes out roughly double the truth. Dividing
// by the full window is no better — it scores the missing days as zero and
// starves the user. So we ask for real coverage first, and fall back to the
// self-reported activity multiplier when we don't have it.
export function averageActiveKcal(
  values: (number | null | undefined)[],
  windowDays: number,
): number | null {
  const present = values.filter((v): v is number => v != null).map(Number);
  if (present.length < Math.min(MIN_ACTIVE_COVERAGE, windowDays)) return null;
  return average(present);
}

// --- Steps as an activity signal --------------------------------------------

// Net cost of walking, above resting, per kg of bodyweight per step. Walking
// runs about 0.35 kcal/kg/km net and a stride averages ~0.75 m, so roughly
// 1333 steps to the kilometre: 0.35 / 1333 ≈ 0.00026. Heavier bodies pay more
// per step, which is why this is per kg rather than a flat kcal/step.
const KCAL_PER_STEP_PER_KG = 0.00026;

// The non-step part of everyday activity — fidgeting, standing, gesturing.
// Real and surprisingly large, but not something steps can see.
const BASELINE_NEAT_FRACTION = 0.1;

// Energy a day's walking costs, above resting.
export function stepKcal(steps: number, weightKg: number): number {
  if (!(steps > 0) || !(weightKg > 0)) return 0;
  return steps * weightKg * KCAL_PER_STEP_PER_KG;
}

// Active energy implied by a step count, for users with a phone but no
// calorie-reporting wearable.
//
// NEAT is the largest source of variation in daily burn between two people of
// the same size — hundreds of kcal — and it is also the thing that quietly
// falls during a diet. Storing steps and never reading them, as this app did,
// throws away the best signal available for both.
export function activeKcalFromSteps(steps: number, weightKg: number, rmrKcal: number) {
  return stepKcal(steps, weightKg) + BASELINE_NEAT_FRACTION * rmrKcal;
}

// A meaningful drop in daily steps between this week and last.
const STEP_DROP_FRACTION = 0.15;

// Whether the user is simply moving less than they were. When a plateau comes
// with the step count falling away, the honest answer is not to cut food — the
// deficit didn't disappear because maintenance rose, it disappeared because the
// user stopped walking. Cutting calories there treats the symptom and makes the
// diet harder at the same time.
export function stepsFalling(
  thisWeekSteps: (number | null | undefined)[],
  lastWeekSteps: (number | null | undefined)[],
): { falling: boolean; thisWeek: number | null; lastWeek: number | null } {
  const now = average(
    thisWeekSteps.filter((s): s is number => s != null && s > 0).map(Number),
  );
  const before = average(
    lastWeekSteps.filter((s): s is number => s != null && s > 0).map(Number),
  );
  if (now == null || before == null || before <= 0) {
    return { falling: false, thisWeek: now, lastWeek: before };
  }
  return {
    falling: (before - now) / before >= STEP_DROP_FRACTION,
    thisWeek: now,
    lastWeek: before,
  };
}

// Split a calorie target into macros: fixed high protein (by bodyweight),
// a quarter of calories from fat, the rest from carbs. Also derive the extra
// nutrient targets — fiber a floor to reach, the rest ceilings to stay under:
//   fiber   14 g per 1000 kcal (dietary guideline)
//   sugar   free sugars ≤ 10% of energy
//   satfat  saturated fat ≤ 10% of energy
//   sodium  2300 mg/day upper limit
export function macrosForKcal(
  kcal: number,
  weightKg: number,
  diet: DietType = "regular",
  heightCm?: number,
  goalWeightKg?: number | null,
): Required<Macros> {
  const wanted = Math.round(
    proteinBasisKg(weightKg, heightCm, goalWeightKg) * PROTEIN_G_PER_KG,
  );

  // 2 g/kg is what we'd LIKE. On a small calorie target for a heavy person it
  // doesn't fit — 240 g of protein is 960 kcal, which on its own blows a 1200
  // kcal day. Prescribing it anyway hands the user a split that contradicts the
  // calorie number printed beside it. So protein only ever gets the calories
  // that are actually left, and the deficit costs protein last.
  const fitProtein = (kcalLeft: number) =>
    Math.max(0, Math.min(wanted, Math.floor(kcalLeft / 4)));

  // Dietary fat is not a macro to be squeezed to nothing: below roughly
  // 0.6 g/kg the body struggles with sex-hormone production and with absorbing
  // the fat-soluble vitamins. The percentage rule alone doesn't protect this —
  // 25% of a 1200 kcal day is 33 g, already marginal — and on keto, where fat is
  // whatever protein leaves behind, a heavy user could be handed a "ketogenic"
  // split with almost no fat in it at all.
  const fatFloorG = Math.min(
    Math.round(proteinBasisKg(weightKg, heightCm, goalWeightKg) * MIN_FAT_G_PER_KG),
    Math.floor((kcal * MAX_FAT_SHARE_FOR_FLOOR) / 9), // never let the floor eat the whole day
  );

  // Keto flips the split: carbs pinned to a low ceiling, fat fills the rest.
  if (diet === "keto") {
    const carbs_g = Math.min(
      KETO_CARBS_G,
      Math.max(0, Math.round(kcal / 4)),
    );
    // Protein yields to the fat floor here, not the other way round — a keto
    // split whose fat has been squeezed out is not a keto split.
    const protein_g = fitProtein(kcal - carbs_g * 4 - fatFloorG * 9);
    const fat_g = Math.max(
      fatFloorG,
      Math.round((kcal - protein_g * 4 - carbs_g * 4) / 9),
    );
    return {
      kcal: Math.round(kcal),
      protein_g,
      carbs_g,
      fat_g,
      fiber_g: Math.round((14 * kcal) / 1000),
      sugar_g: Math.min(carbs_g, Math.round((0.1 * kcal) / 4)),
      satfat_g: Math.round((0.1 * kcal) / 9),
      sodium_mg: 2300,
    };
  }

  const fat_g = Math.max(fatFloorG, Math.round((kcal * FAT_FRACTION_OF_KCAL) / 9));
  const protein_g = fitProtein(kcal - fat_g * 9);
  const carbs_g = Math.max(
    0,
    Math.round((kcal - protein_g * 4 - fat_g * 9) / 4),
  );
  return {
    kcal: Math.round(kcal),
    protein_g,
    carbs_g,
    fat_g,
    fiber_g: Math.round((14 * kcal) / 1000),
    sugar_g: Math.round((0.1 * kcal) / 4),
    satfat_g: Math.round((0.1 * kcal) / 9),
    sodium_mg: 2300,
  };
}

// The daily calorie deficit for a chosen pace, derived from the target loss
// rate (kg/week × 7700 kcal/kg ÷ 7 days). The rate is first capped at 1% of
// bodyweight/week so a light person never gets an unsafe deficit.
export function deficitPerDay(
  pace: GoalPace,
  weightKg: number,
  bodyFatPct?: number | null,
  sex: Sex = "female",
): number {
  // The pace the user picked, capped by what's safe for how lean they are.
  const band = healthyLossBand(sex, bodyFatPct);
  const kgPerWeek = Math.min(
    PACE_KG_PER_WEEK[pace],
    Math.max(MAX_WEEKLY_LOSS_FRACTION, band.max) * weightKg,
    band.max * weightKg,
  );
  return (kgPerWeek * KCAL_PER_KG) / 7;
}

// Full daily macro target for a user in a weight-loss deficit.
export function dailyTarget(input: CoachInput): Macros {
  const maintenance = tdee(input);
  const rmr = restingRate(input);

  // Three separate brakes, because each catches a case the others miss: the
  // rate cap stops a light person losing too fast, the fractional cap stops a
  // heavy person with a low burn being handed a 45% deficit, and the floor stops
  // anyone being told to eat below their own resting metabolism.
  const wanted = deficitPerDay(
    input.pace,
    input.weightKg,
    input.bodyFatPct,
    input.sex,
  );
  const deficit = Math.min(wanted, maintenance * MAX_DEFICIT_FRACTION);
  const target = Math.max(maintenance - deficit, kcalFloor(input.sex, rmr));

  return macrosForKcal(
    target,
    input.weightKg,
    input.diet,
    input.heightCm,
    input.goalWeightKg,
  );
}

// The full macro target for eating at maintenance — the calibration phase, and
// the anchor every deficit is measured down from. Same split as a deficit, just
// with nothing subtracted. Never below the safe floor.
export function maintenanceTarget(input: Omit<CoachInput, "pace">): Macros {
  const kcal = Math.max(tdee(input), kcalFloor(input.sex, restingRate(input)));
  return macrosForKcal(
    kcal,
    input.weightKg,
    input.diet,
    input.heightCm,
    input.goalWeightKg,
  );
}

// Week boundaries live in src/lib/time.ts (localWeekStart), which draws them in
// the user's timezone. This used to mix the server's local calendar with UTC.

// --- Measured energy expenditure --------------------------------------------
// Everything above this line PREDICTS a burn rate from height, weight, age and
// a self-reported activity level. Mifflin's standard error is around 10% and
// its tails reach 25%, so for any given person the prediction can be 400 kcal
// out in either direction before NEAT, adaptation or logging bias are counted.
//
// But energy balance is measurable, and this app already stores both sides of
// it. Over a window of days:
//
//   TDEE ≈ mean daily intake + (trend weight lost × 7700) / days
//
// That single line absorbs a wrong BMR, an over- or under-stated activity
// level, metabolic adaptation, AND the user's own logging bias — because the
// bias is fitted against real weight change rather than assumed away. It is the
// difference between a coach that guesses and one that learns.

// The window has to be long enough that a few hundred kcal of day-to-day water
// movement doesn't dominate the weight term.
const MIN_OBSERVE_DAYS = 14;

// And enough of those days need a food log. Mean intake over only the days the
// user bothered to log is a biased sample of what they ate: the unlogged days
// are the big ones. Reading that as a low intake would make the measured burn
// look small and cut the target — punishing the user for patchy logging.
const MIN_LOG_COVERAGE = 0.8;

export interface DailyIntake {
  date: string; // YYYY-MM-DD, the user's local day
  kcal: number;
}

export interface ObservedTdee {
  kcalPerDay: number;
  days: number; // span the estimate covers
  loggedDays: number; // days within it that carried a food log
  meanIntakeKcal: number;
  trendDeltaKg: number; // positive = lost over the window
}

// TDEE implied by intake and the movement of the trend weight. Pure arithmetic
// on the energy balance equation; the caller supplies an honest window.
export function tdeeFromEnergyBalance(
  meanIntakeKcal: number,
  trendDeltaKg: number,
  days: number,
): number {
  return meanIntakeKcal + (trendDeltaKg * KCAL_PER_KG) / days;
}

// Measure the user's actual daily burn from what they ate and what the scale
// did. Null whenever the data can't support an honest answer — a wrong measured
// TDEE is worse than none, because the whole point is that the app trusts it
// over the formula.
export function observeTdee(
  weighIns: WeighIn[],
  intake: DailyIntake[],
  windowDays = TREND_WINDOW_DAYS,
): ObservedTdee | null {
  const clean = weighIns.filter((p) => Number.isFinite(p.kg) && p.kg > 0);
  if (clean.length < 2) return null;

  const dates = clean.map((p) => p.date).sort();
  const lastDate = dates[dates.length - 1];
  const firstDate = dates.find(
    (d) => (dayMs(lastDate) - dayMs(d)) / DAY_MS <= windowDays - 1,
  );
  if (firstDate == null) return null;

  const days = (dayMs(lastDate) - dayMs(firstDate)) / DAY_MS;
  if (days < MIN_OBSERVE_DAYS - 1) return null;

  // The weight term is the regression slope over the window, not the difference
  // between two smoothed endpoints: the filter's lag would under-report the loss
  // and hand back a burn rate several hundred kcal too low.
  const inWindow = clean.filter((p) => p.date >= firstDate && p.date <= lastDate);
  const slope = weightSlopeKgPerDay(inWindow);
  if (slope == null) return null;

  const first = { date: firstDate };
  const last = { date: lastDate };

  // Only intake inside the same window counts — the weight term and the intake
  // term have to describe the same stretch of time or the arithmetic is meaningless.
  const logged = intake.filter(
    (d) => d.date >= first.date && d.date <= last.date && d.kcal > 0,
  );
  if (logged.length < Math.ceil(days * MIN_LOG_COVERAGE)) return null;

  const meanIntakeKcal = average(logged.map((d) => d.kcal));
  if (meanIntakeKcal == null || meanIntakeKcal <= 0) return null;

  const trendDeltaKg = -slope * days; // positive = lost over the window
  return {
    kcalPerDay: tdeeFromEnergyBalance(meanIntakeKcal, trendDeltaKg, days),
    days,
    loggedDays: logged.length,
    meanIntakeKcal,
    trendDeltaKg,
  };
}

// How far the measured burn is allowed to drag the prediction. A measurement
// built on logged food inherits some of that log's error, so an unbounded
// factor would let one badly-logged fortnight rewrite the user's metabolism.
const MIN_CALIBRATION = 0.75;
const MAX_CALIBRATION = 1.25;

// How fast the calibration moves towards a new measurement. Half-way each
// review: quick enough to be useful within a month, slow enough that a single
// odd window doesn't take over.
const CALIBRATION_STEP = 0.5;

// Fold a fresh measurement into the running calibration factor — the ratio
// between what the user actually burns and what the formula predicted.
export function updateCalibration(
  previous: number | null | undefined,
  observedKcal: number,
  predictedKcal: number,
): number {
  if (predictedKcal <= 0 || observedKcal <= 0) return previous ?? 1;
  const raw = clamp(observedKcal / predictedKcal, MIN_CALIBRATION, MAX_CALIBRATION);
  const prior = previous != null && previous > 0 ? previous : 1;
  return clamp(
    prior + CALIBRATION_STEP * (raw - prior),
    MIN_CALIBRATION,
    MAX_CALIBRATION,
  );
}

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}

// --- Adherence --------------------------------------------------------------

// A day counts as "ate the plan" when intake landed within this fraction of the
// target. Wide enough that ordinary life passes, tight enough that a 600 kcal
// overshoot doesn't.
const ADHERENCE_TOLERANCE = 0.15;

// And this many of the week's days have to qualify before the coach will act on
// a stall.
const MIN_ADHERENT_DAYS = 4;

export interface Adherence {
  loggedDays: number;
  adherentDays: number;
  meanIntakeKcal: number | null;
  followed: boolean;
}

// How closely the user actually ate the target they were given.
//
// Without this the review is measuring the wrong thing. A plateau has two quite
// different causes — the target is too high, or the user ate more than it — and
// the scale alone cannot tell them apart. Cutting on the second is actively
// harmful: it makes an already-unfollowed plan harder to follow, which widens
// the gap, which triggers another cut. The way out of that spiral is to say
// "eat the plan" rather than to keep shrinking it.
export function adherence(
  intake: DailyIntake[],
  targetKcal: number,
  windowDays = TREND_SPAN_DAYS,
): Adherence {
  const recent = intake.slice(-windowDays);
  const meanIntakeKcal = average(recent.map((d) => d.kcal));

  if (targetKcal <= 0) {
    return {
      loggedDays: recent.length,
      adherentDays: 0,
      meanIntakeKcal,
      followed: false,
    };
  }

  const adherentDays = recent.filter(
    (d) => Math.abs(d.kcal - targetKcal) / targetKcal <= ADHERENCE_TOLERANCE,
  ).length;

  return {
    loggedDays: recent.length,
    adherentDays,
    meanIntakeKcal,
    followed: adherentDays >= Math.min(MIN_ADHERENT_DAYS, windowDays),
  };
}

// --- The weekly review ------------------------------------------------------
// Compare this week's trailing average weight to last week's and nudge the
// calorie target. Result-based (no AI): the rules read the scale + tape, not a
// recomputed TDEE, so a plateau gets a real cut rather than a guess.

// The healthy band is no longer a constant — it depends on how lean the user
// is (see healthyLossBand). What stays fixed is how hard the coach nudges.

// --- Phases -----------------------------------------------------------------
// A deficit is not the only state a plan can be in, and pretending otherwise is
// how the old review became a one-way ratchet: cut, cut, cut, hit the floor,
// hold there for ever. Nothing but a too-fast loss ever moved a target up, and
// reaching the goal weight did nothing at all.

export type Phase = "calibration" | "deficit" | "diet_break" | "maintenance";

// --- Calibration ------------------------------------------------------------
// A new user is not dropped straight into a deficit. First they eat at estimated
// maintenance for a short window while the app watches the scale and learns what
// they actually burn (adaptive TDEE, MacroFactor-style). A deficit built on the
// formula alone can be hundreds of kcal wrong; one built on a fortnight of real
// data is not. Only once calibrated does the modest cut begin — and cycling
// (high days) stays locked until then, since an uncalibrated cut is exactly
// where carbs get pushed far too low.

// The window the hold lasts. We aim for a fortnight but will graduate a diligent
// logger at ten days once there's a trustworthy measurement, and we will not
// hold anyone past the max however patchy their data — an endless "calibrating"
// screen is its own failure.
export const CALIBRATION_MIN_DAYS = 10;
export const CALIBRATION_MAX_DAYS = 14;

// Whole days since the calibration window opened (0 when it never did).
export function calibrationDaysElapsed(
  startedAt: string | null | undefined,
  now = new Date(),
): number {
  if (!startedAt) return 0;
  const ms = now.getTime() - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / DAY_MS);
}

// A soft count-down for the UI: about this many days left before the user can
// expect to graduate. Never negative.
export function calibrationDaysRemaining(
  startedAt: string | null | undefined,
  now = new Date(),
): number {
  return Math.max(0, CALIBRATION_MIN_DAYS - calibrationDaysElapsed(startedAt, now));
}

export interface CalibrationState {
  startedAt: string | null | undefined;
  now?: Date;
  // The measured burn from intake against the scale — null until there are
  // enough weigh-ins and food logs to trust one (see observeTdee). Its presence
  // is what tells us the hold has actually taught us something.
  observed: ObservedTdee | null;
}

// Whether the calibration hold is over and a deficit may begin. Graduate when
// the minimum window has passed AND we have a real measurement, OR when the max
// window elapses regardless — but never while the user was never calibrating.
// Sparse logging keeps `observed` null, which extends the hold rather than
// cutting on data too thin to trust.
export function calibrationComplete(state: CalibrationState): boolean {
  if (!state.startedAt) return false;
  const days = calibrationDaysElapsed(state.startedAt, state.now);
  if (days >= CALIBRATION_MAX_DAYS) return true;
  return days >= CALIBRATION_MIN_DAYS && state.observed != null;
}

// Whether the user is in the calibration hold right now: the window is open and
// hasn't yet graduated.
export function inCalibration(state: CalibrationState): boolean {
  return Boolean(state.startedAt) && !calibrationComplete(state);
}

// The first deficit after calibration is deliberately modest — a sustainable
// 300–500 kcal/day, never an aggressive opener however impatient the chosen
// pace. Real results earn a faster cut later; the data does the arguing, not the
// user's optimism at onboarding.
export const OPENING_DEFICIT_MIN_KCAL = 300;
export const OPENING_DEFICIT_MAX_KCAL = 500;

// Clamp a pace-derived deficit into the modest opening band used when the cut
// first begins.
export function openingDeficitKcal(paceDeficitKcal: number): number {
  return clamp(paceDeficitKcal, OPENING_DEFICIT_MIN_KCAL, OPENING_DEFICIT_MAX_KCAL);
}

// Weeks of unbroken deficit after which the body deserves a planned break.
// Long diets blunt their own progress: adaptive thermogenesis, falling NEAT,
// rising hunger hormones. A week or two at maintenance recovers a good deal of
// that and buys a better second half. Planned, it's a strategy; unplanned, it's
// what people call falling off the wagon.
const WEEKS_BEFORE_DIET_BREAK = 12;
const DIET_BREAK_WEEKS = 2;

// How close to the goal counts as arrived.
const GOAL_REACHED_KG = 0.5;

export interface PhaseInput {
  weeksInDeficit: number; // consecutive weeks eating at a deficit
  weeksInBreak: number; // consecutive weeks already on a break
  currentWeightKg: number;
  goalWeightKg?: number | null;
  // The new-user hold at maintenance. When the window is open and hasn't yet
  // taught us enough, the plan stays in calibration regardless of everything
  // else — no deficit, no cycling, until the app has learned the real burn.
  inCalibration?: boolean;
  calibrationComplete?: boolean;
}

// Which phase the plan should be in this week.
export function nextPhase(input: PhaseInput): Phase {
  const { weeksInDeficit, weeksInBreak, currentWeightKg, goalWeightKg } = input;

  // Still learning the user's body — hold at maintenance and cut nothing yet.
  if (input.inCalibration && !input.calibrationComplete) return "calibration";

  // Arrived. Stop dieting — an app that keeps cutting past the goal is not
  // coaching, and "what now" is the question most weight-loss plans never answer.
  if (goalWeightKg != null && goalWeightKg > 0 && currentWeightKg <= goalWeightKg + GOAL_REACHED_KG) {
    return "maintenance";
  }

  if (weeksInBreak > 0 && weeksInBreak < DIET_BREAK_WEEKS) return "diet_break";
  if (weeksInBreak >= DIET_BREAK_WEEKS) return "deficit";
  if (weeksInDeficit >= WEEKS_BEFORE_DIET_BREAK) return "diet_break";
  return "deficit";
}

// The calorie target for a phase. Only a deficit eats below maintenance;
// calibration, a diet break and maintenance all eat AT it — the difference is
// intent and what happens next.
export function kcalForPhase(phase: Phase, maintenanceKcal: number, deficitKcal: number) {
  return phase === "deficit" ? maintenanceKcal - deficitKcal : maintenanceKcal;
}
const CUT_STEP = 0.07; // trim 7 % when stalled
const ADD_STEP = 0.05; // add 5 % when dropping too fast

// Fallback only: when the caller can't supply a real maintenance figure, assume
// the current target sits about this far below it. Never used to step a target
// UP repeatedly -- see maintenanceTargetKcal.
const MAINTENANCE_UPLIFT = 0.2;

// The calorie figure to hold at. Prefer the real maintenance estimate the
// caller computed from the profile; only fall back to inflating the current
// target when there isn't one.
//
// Back-deriving maintenance from the target in force cannot be repeated: raise
// 2000 to 2500, and next week 2500 becomes 3125, then 3906. The estimate has to
// come from outside the loop, or the loop feeds on itself.
function maintenanceTargetKcal(currentKcal: number, maintenanceKcal?: number | null) {
  if (maintenanceKcal != null && maintenanceKcal > 0) return Math.round(maintenanceKcal);
  return Math.round(currentKcal / (1 - MAINTENANCE_UPLIFT));
}

// Give the body time before judging a target. One week of scale movement is
// mostly water and noise — the body needs about two weeks on a set of macros to
// show whether it's really adapting. We hold (never cut or add) until the
// current target has been in force this long AND the user logged consistently.
const MIN_WEEKS_ON_TARGET = 2;

// Plain mean of a list of weights; null when the list is empty.
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// --- Trend weight -----------------------------------------------------------

const DAY_MS = 86_400_000;

// Smoothing factor for the trend. 0.1 is the long-standing Hacker's-Diet
// value: each weigh-in moves the trend by a tenth of its surprise, so a single
// salty Sunday shifts it by grams rather than kilos.
const TREND_ALPHA = 0.1;

// How much weigh-in history the trend reads, and the span the weekly rate of
// change is measured over.
export const TREND_WINDOW_DAYS = 28;
export const TREND_SPAN_DAYS = 7;

export interface WeighIn {
  date: string; // YYYY-MM-DD, the user's local day
  kg: number;
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

// Exponentially weighted trend weight, one value per calendar day from the
// first weigh-in to the last.
//
// A 7-day mean against the previous 7-day mean is the noisiest estimator that
// still works. It discards everything older than a fortnight, weighs a Monday
// the same as a Sunday, and lets one heavy-carb evening decide whether the
// coach cuts. An EWMA filters the whole history instead — and because it is a
// filter rather than a window, its SLOPE still tracks the true rate of loss
// even though its level lags the scale by a week or so. Slope is what the
// review acts on, so the lag costs nothing.
//
// Days with no weigh-in carry the trend forward untouched: not standing on the
// scale is not evidence about weight.
export function trendSeries(
  points: WeighIn[],
  alpha = TREND_ALPHA,
): { date: string; kg: number }[] {
  const byDay = new Map<string, number[]>();
  for (const p of points) {
    if (!Number.isFinite(p.kg) || p.kg <= 0) continue;
    const list = byDay.get(p.date);
    if (list) list.push(p.kg);
    else byDay.set(p.date, [p.kg]);
  }

  const days = [...byDay.keys()].sort();
  if (days.length === 0) return [];

  const dayMean = (d: string) => average(byDay.get(d) ?? []) ?? 0;

  const out: { date: string; kg: number }[] = [];
  let trend = dayMean(days[0]);
  const lastMs = dayMs(days[days.length - 1]);
  for (let t = dayMs(days[0]); t <= lastMs; t += DAY_MS) {
    const date = dayKey(t);
    if (byDay.has(date)) trend += alpha * (dayMean(date) - trend);
    out.push({ date, kg: trend });
  }
  return out;
}

// Least-squares slope of weight against time, in kg/day (negative = losing).
// Null when there aren't two distinct days to draw a line through.
//
// This is what measures the rate, NOT the difference between two points of the
// trend. An EWMA lags a falling weight by about nine days, so while someone is
// still early in a diet the filter has not caught up and endpoint-differencing
// reports less loss than really happened. That bias points the wrong way: it
// reads real progress as a stall and cuts the user's food. A regression has no
// lag, uses every weigh-in rather than two of them, and handles the ragged
// spacing of real logging for free.
export function weightSlopeKgPerDay(points: WeighIn[]): number | null {
  const clean = points.filter((p) => Number.isFinite(p.kg) && p.kg > 0);
  if (clean.length < 2) return null;

  const xs = clean.map((p) => dayMs(p.date) / DAY_MS);
  const ys = clean.map((p) => p.kg);
  const xMean = average(xs)!;
  const yMean = average(ys)!;

  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - xMean;
    num += dx * (ys[i] - yMean);
    den += dx * dx;
  }
  if (den === 0) return null; // every weigh-in on the same day
  return num / den;
}

export interface TrendChange {
  nowKg: number; // smoothed weight today
  thenKg: number; // where that implies the user was one span ago
  changeKg: number; // positive = lost
  changePct: number; // fraction of bodyweight over the span
  spanDays: number;
}

// The user's rate of loss over the last `spanDays`, and where their weight sits
// today. The rate comes from the regression slope; the level comes from the
// trend filter, which is the better answer for "what do you weigh" because it
// is not pulled about by the last day's water.
//
// Null when the weigh-ins don't actually cover the span — better to say nothing
// than to report a rate drawn through a couple of days and call it a week.
export function trendChange(
  points: WeighIn[],
  spanDays = TREND_SPAN_DAYS,
): TrendChange | null {
  const clean = points.filter((p) => Number.isFinite(p.kg) && p.kg > 0);
  if (clean.length < 2) return null;

  const dates = clean.map((p) => dayMs(p.date));
  const coveredDays = (Math.max(...dates) - Math.min(...dates)) / DAY_MS;
  if (coveredDays < spanDays) return null;

  const slope = weightSlopeKgPerDay(clean);
  const series = trendSeries(clean);
  if (slope == null || series.length === 0) return null;

  const nowKg = series[series.length - 1].kg;
  const changeKg = -slope * spanDays; // positive = lost
  const thenKg = nowKg + changeKg;
  if (thenKg <= 0) return null;

  return { nowKg, thenKg, changeKg, changePct: changeKg / thenKg, spanDays };
}

export interface WeeklyReviewInput {
  sex: Sex;
  diet?: DietType; // defaults to "regular"; keeps a keto split on recompute
  // Movement of the smoothed trend weight over the last week, from
  // trendChange(). Null when there isn't enough weigh-in history to span a
  // week — the review holds rather than inventing a rate.
  trend: TrendChange | null;
  waistDeltaCm: number | null; // latest waist − previous waist (− = shrinking)
  current: Macros; // the target in force now
  heightCm?: number; // caps the protein basis on recompute (same as onboarding)
  goalWeightKg?: number | null; // preferred target weight for the protein cap
  // Cadence gates. Whole weeks the current target has been unchanged, and
  // whether the user weighed in often enough to trust the trend. When either
  // says "not ready" we hold rather than guess. Omitted = no opinion (the field
  // is only supplied by the live review; unit tests exercise a ready state).
  weeksOnTarget?: number;
  consistent?: boolean;
  // How closely the user ate the target this week. Omitted = no opinion, which
  // leaves the old scale-only behaviour for callers that don't supply it.
  adherence?: Adherence;
  // Whether daily steps fell away compared with the week before.
  stepsDropped?: ReturnType<typeof stepsFalling>;
  // Body fat sets how fast this user can safely lose; resting rate sets the real
  // calorie floor. Both optional -- absent falls back to the old flat numbers.
  bodyFatPct?: number | null;
  restingRateKcal?: number | null;
  // Which phase the plan is in this week (see nextPhase). Defaults to a
  // deficit, which is what every caller meant before phases existed.
  phase?: Phase;
  // The phase the CURRENT (in-force) target belongs to. Lets the review notice a
  // transition — leaving calibration or a diet break — and open the deficit
  // fresh from maintenance rather than nudging the maintenance target by a few
  // per cent. Omitted = same as `phase` (no transition).
  prevPhase?: Phase;
  // The modest deficit to OPEN a cut with, in kcal/day (see openingDeficitKcal).
  // Only used on the calibration→deficit / break→deficit transition; the ongoing
  // review nudges by percentages instead.
  deficitKcal?: number | null;
  // A weight to build recomputed macros from when there's no trend yet (a
  // just-onboarded calibrating user). Falls back to the trend weight when set.
  weightKg?: number | null;
  // Days left in the calibration hold, for the message. 0 = graduating now.
  calibrationDaysRemaining?: number;
  // This user's maintenance calories, computed from their profile. Needed to
  // hold at maintenance without back-deriving it from the target in force,
  // which compounds every week.
  maintenanceKcal?: number | null;
}

export interface WeeklyReview {
  macros: Macros; // the target to use next week (unchanged when changed=false)
  changed: boolean;
  changeKg: number | null; // positive = weight lost
  changePct: number | null; // fraction of bodyweight lost
  headline: string; // one short line, plain words
  detail: string; // the reasoning, plain words
}

export function weeklyReview(input: WeeklyReviewInput): WeeklyReview {
  const {
    current,
    trend,
    waistDeltaCm,
    sex,
    diet = "regular",
    heightCm,
    goalWeightKg,
    weeksOnTarget,
    consistent,
    adherence,
    stepsDropped,
    bodyFatPct,
    restingRateKcal,
    phase = "deficit",
    prevPhase,
    deficitKcal,
    weightKg,
    calibrationDaysRemaining,
    maintenanceKcal,
  } = input;

  // A weight to build recomputed macros from: the trend when we have one, else
  // the fallback the caller passed (a just-onboarded user with no trend yet).
  const macroWeightKg = trend?.nowKg ?? weightKg ?? null;
  const maint =
    maintenanceKcal != null && maintenanceKcal > 0
      ? Math.round(maintenanceKcal)
      : null;

  // Calibration: the user's first ~2 weeks eating at estimated maintenance so
  // the app can learn their real burn from the scale before ever cutting. Hold
  // the maintenance target and frame it honestly — we're measuring, not judging
  // a loss that isn't meant to happen yet. This runs before every other gate:
  // there's nothing to review, because nothing is being adjusted.
  if (phase === "calibration") {
    const target = maint ?? current.kcal;
    const atMaintenance = current.kcal >= target - 20;
    const daysLeft = calibrationDaysRemaining ?? 0;
    return {
      macros:
        atMaintenance || macroWeightKg == null
          ? current
          : macrosForKcal(target, macroWeightKg, diet, heightCm, goalWeightKg),
      changed: !atMaintenance && macroWeightKg != null,
      changeKg: trend?.changeKg ?? null,
      changePct: trend?.changePct ?? null,
      headline: "Learning your body",
      detail:
        daysLeft > 0
          ? `For your first couple of weeks we eat at your estimated maintenance — about ${target} kcal — so I can see how your body really responds before we cut anything. Around ${daysLeft} day${
              daysLeft === 1 ? "" : "s"
            } to go. Log your food and weight daily; I'm measuring, not judging.`
          : `We're wrapping up your calibration at about ${target} kcal. Keep logging your food and weight and I'll set your deficit from what your body actually does, not a formula's guess.`,
    };
  }

  // Leaving calibration (or a diet break) for the deficit: open the cut fresh
  // from maintenance at a modest, sustainable rate — do NOT nudge the
  // maintenance target down by a few per cent, which would barely be a deficit.
  // Only fires when the caller supplies both a maintenance figure and an opening
  // deficit, so ordinary weekly reviews are untouched.
  if (
    phase === "deficit" &&
    prevPhase != null &&
    prevPhase !== "deficit" &&
    maint != null &&
    deficitKcal != null &&
    deficitKcal > 0 &&
    macroWeightKg != null
  ) {
    const floorK = kcalFloor(sex, restingRateKcal);
    const target = Math.max(Math.round(maint - deficitKcal), floorK);
    const cut = maint - target;
    const fromCalibration = prevPhase === "calibration";
    return {
      macros: macrosForKcal(target, macroWeightKg, diet, heightCm, goalWeightKg),
      changed: true,
      changeKg: trend?.changeKg ?? null,
      changePct: trend?.changePct ?? null,
      headline: fromCalibration
        ? "Calibration done — starting your cut"
        : "Break's over — back to your cut",
      detail: fromCalibration
        ? `I've learned what you actually burn: about ${maint} kcal a day. Now we start a gentle ${cut} kcal/day deficit — a sustainable pace, not a crash. Your new target is ${target} kcal. I'll keep correcting it from your real results.`
        : `Back to it. I've set a modest ${cut} kcal/day deficit from your maintenance of about ${maint} kcal — target ${target} kcal.`,
    };
  }

  // Not enough history yet — hold and ask for another week. trendChange returns
  // null rather than a rate it can't support, which keeps the coach from
  // reading missing data as a dramatic loss and adding calories for it.
  if (trend == null) {
    return {
      macros: current,
      changed: false,
      changeKg: null,
      changePct: null,
      headline: "Keep going",
      detail:
        "Log your weight for another week and I'll review your targets against your trend.",
    };
  }

  // Patchy weigh-ins → the weekly average can't be trusted. Hold rather than
  // change targets on thin data.
  if (consistent === false) {
    return {
      macros: current,
      changed: false,
      changeKg: null,
      changePct: null,
      headline: "Need a fuller week",
      detail:
        "You've only logged a few weigh-ins, so I can't trust the trend yet. Weigh in on most days and I'll give you an accurate review.",
    };
  }

  // Current target is still new — give the body ~2 weeks to respond before
  // judging it. Changing now would just be reacting to water weight.
  if ((weeksOnTarget ?? MIN_WEEKS_ON_TARGET) < MIN_WEEKS_ON_TARGET) {
    return {
      macros: current,
      changed: false,
      changeKg: null,
      changePct: null,
      headline: "Settling in",
      detail:
        "Your targets are still new — your body needs a couple of weeks to respond before I can tell if they're working. Keep logging and I'll review then.",
    };
  }

  const { changeKg, changePct, nowKg } = trend; // + = lost
  const lostText = `${Math.abs(changeKg).toFixed(1)} kg`;

  // What counts as healthy depends on how much fat there is to draw on, and the
  // floor depends on this user's own resting metabolism -- not on a flat number
  // that happens to be attached to their sex.
  const band = healthyLossBand(sex, bodyFatPct);
  const floor = kcalFloor(sex, restingRateKcal);

  // Goal reached → stop dieting and say so. An app that keeps cutting past the
  // finish line isn't coaching, and "what now" is the question most weight-loss
  // plans never answer.
  if (phase === "maintenance") {
    const target = maintenanceTargetKcal(current.kcal, maintenanceKcal);
    const atMaintenance = current.kcal >= target - 20;
    return {
      macros: atMaintenance
        ? current
        : macrosForKcal(target, nowKg, diet, heightCm, goalWeightKg),
      changed: !atMaintenance,
      changeKg,
      changePct,
      headline: "You're at your goal",
      detail: atMaintenance
        ? "You're eating at maintenance and holding. This is the part that lasts — keep weighing in and I'll tell you if the trend starts to drift."
        : `You've reached the weight you were aiming for, so there's no reason to keep eating at a deficit. I've moved you up to about ${target} kcal to hold here. Keep logging and I'll catch any drift early.`,
    };
  }

  // A long deficit blunts its own progress: the burn adapts down, everyday
  // movement quietly falls, hunger climbs. A planned fortnight at maintenance
  // recovers much of that and makes the next block work. Planned, it's a
  // strategy; unplanned, it's what people call falling off the wagon.
  if (phase === "diet_break") {
    const target = maintenanceTargetKcal(current.kcal, maintenanceKcal);
    const onBreak = current.kcal >= target - 20;
    return {
      macros: onBreak
        ? current
        : macrosForKcal(target, nowKg, diet, heightCm, goalWeightKg),
      changed: !onBreak,
      changeKg,
      changePct,
      headline: onBreak ? "Diet break — keep going" : "Time for a diet break",
      detail: onBreak
        ? "You're eating at maintenance for a couple of weeks. The scale won't move much and that's the point — this is what makes the next block work."
        : `You've been in a deficit for a while now, and long deficits blunt themselves — your burn adapts down and you move less without noticing. I've put you at about ${target} kcal for a fortnight. It isn't lost progress; it's what makes the next block work.`,
    };
  }

  // Healthy rate → keep the target.
  if (changePct >= band.min && changePct <= band.max) {
    return {
      macros: current,
      changed: false,
      changeKg,
      changePct,
      headline: `Down ${lostText} — bang on`,
      detail: `That's a healthy ${(changePct * 100).toFixed(
        1,
      )}% of your bodyweight this week. Keeping your targets exactly where they are.`,
    };
  }

  // Losing too fast → add a little back to protect muscle.
  if (changePct > band.max) {
    const newKcal = Math.round(current.kcal * (1 + ADD_STEP));
    return {
      macros: macrosForKcal(newKcal, nowKg, diet, heightCm, goalWeightKg),
      changed: true,
      changeKg,
      changePct,
      headline: `Down ${lostText} — a touch quick`,
      detail: `Losing faster than about 1%/week starts costing muscle. I've added ${
        newKcal - current.kcal
      } kcal/day to steady it to a healthy pace.`,
    };
  }

  // Barely moved, but the tape says fat is coming off → hold and explain.
  if (waistDeltaCm != null && waistDeltaCm <= -0.5) {
    return {
      macros: current,
      changed: false,
      changeKg,
      changePct,
      headline: "Scale flat, waist down",
      detail: `The scale barely moved but your waist is down ${Math.abs(
        waistDeltaCm,
      ).toFixed(
        1,
      )} cm — that's fat loss the scale can't see. Holding your targets.`,
    };
  }

  // The other direction, which used to have no rule at all: the scale is flat
  // or falling but the waist is GROWING. That is composition moving the wrong
  // way — muscle going, fat arriving — and cutting calories is exactly the
  // wrong response, because a deeper deficit costs more muscle still.
  if (waistDeltaCm != null && waistDeltaCm >= 0.5) {
    return {
      macros: current,
      changed: false,
      changeKg,
      changePct,
      headline: "Waist up — let's not cut",
      detail: `Your waist is up ${waistDeltaCm.toFixed(
        1,
      )} cm even though the scale hasn't moved much. That usually means muscle going and fat arriving, and cutting calories would only speed that up. Hold these targets, get your protein in, and add some resistance work if you can.`,
    };
  }

  // Stalled because the user is moving less, not because maintenance moved.
  // Cutting food here treats the symptom and makes the diet harder at once; the
  // deficit is recovered far more cheaply by walking as much as last week.
  if (stepsDropped?.falling) {
    return {
      macros: current,
      changed: false,
      changeKg,
      changePct,
      headline: "Your steps dropped this week",
      detail: `You averaged ${Math.round(
        stepsDropped.thisWeek ?? 0,
      )} steps a day against ${Math.round(
        stepsDropped.lastWeek ?? 0,
      )} the week before. That's most of your missing deficit right there, and walking it back is a far better trade than eating less. Holding your targets.`,
    };
  }

  // Stalled, but the plan wasn't actually followed → say so instead of cutting.
  //
  // This gate only guards the CUT. Losing too fast still gets calories back
  // regardless of how well anyone logged, because that branch exists to protect
  // muscle and shouldn't wait on paperwork.
  if (adherence && !adherence.followed) {
    const ate = adherence.meanIntakeKcal;
    const over = ate != null && ate > current.kcal;
    return {
      macros: current,
      changed: false,
      changeKg,
      changePct,
      headline: over ? "Above your target this week" : "Let's test the plan first",
      detail:
        adherence.loggedDays === 0
          ? "I can't see what you ate this week, so I don't know whether the target is wrong or just wasn't hit. Log your food for a week and I'll know which."
          : over
            ? `You averaged about ${Math.round(
                ate!,
              )} kcal against a target of ${current.kcal}. The plan hasn't really been tested yet — cutting it now would just make a target you're already over even harder to hit. Let's hit this one first.`
            : "Your intake was all over the place this week, so a stall doesn't tell me much yet. Stick close to the target for a week and I'll know whether it needs to move.",
    };
  }

  // Stalled or gaining, already at the safe floor → hold.
  if (current.kcal <= floor) {
    return {
      macros: current,
      changed: false,
      changeKg,
      changePct,
      headline: "Holding at your floor",
      detail: `Progress stalled, but you're already at the safe minimum of ${floor} kcal. Let's hold here and lean on activity rather than cutting further.`,
    };
  }

  // Stalled or gaining → trim calories.
  const newKcal = Math.max(floor, Math.round(current.kcal * (1 - CUT_STEP)));
  const gained = changeKg < 0;
  return {
    macros: macrosForKcal(newKcal, nowKg, diet, heightCm, goalWeightKg),
    changed: true,
    changeKg,
    changePct,
    headline: gained
      ? `Up ${Math.abs(changeKg).toFixed(1)} kg this week`
      : "Loss has stalled",
    detail: `I've trimmed ${
      current.kcal - newKcal
    } kcal/day to get the scale moving again. We'll check in next week.`,
  };
}
