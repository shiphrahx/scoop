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

// BMR → non-exercise daily burn (resting + living, no workouts). When we have
// measured exercise from a device we add the real burn on top of this baseline
// instead of guessing the whole activity factor. 1.2 is the standard sedentary
// multiplier — i.e. everything except deliberate exercise.
const NEAT_MULTIPLIER = 1.2;

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

// Never eat below this, whatever the maths say (safety floor).
const MIN_KCAL: Record<Sex, number> = {
  male: 1500,
  female: 1200,
};

const PROTEIN_G_PER_KG = 2.0; // high protein to protect muscle in a deficit
const FAT_FRACTION_OF_KCAL = 0.25;
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
  // Measured average daily exercise burn (kcal) from Fitbit/Apple. When
  // present it replaces the self-reported activity multiplier with real data.
  workoutKcalPerDay?: number | null;
  // Body-fat fraction as a percentage (e.g. 22 for 22%). Optional — when known
  // the resting rate switches to Katch–McArdle (driven by lean mass), which is
  // more accurate than Mifflin for both lean and very-heavy bodies.
  bodyFatPct?: number | null;
  // The user's target weight, if set. Caps the protein basis (see proteinBasisKg).
  goalWeightKg?: number | null;
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

// Total daily energy expenditure. With a measured exercise burn we build it
// from the non-exercise baseline plus that real burn; otherwise we fall back to
// the self-reported activity factor.
export function tdee(input: Omit<CoachInput, "pace">) {
  const base = restingRate(input);
  if (input.workoutKcalPerDay != null && input.workoutKcalPerDay > 0) {
    return base * NEAT_MULTIPLIER + input.workoutKcalPerDay;
  }
  return base * ACTIVITY_MULTIPLIER[input.activity];
}

export function ageFromBirthYear(birthYear: number, now = new Date()) {
  return now.getFullYear() - birthYear;
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
  const protein_g = Math.round(
    proteinBasisKg(weightKg, heightCm, goalWeightKg) * PROTEIN_G_PER_KG,
  );

  // Keto flips the split: carbs pinned to a low ceiling, fat fills the rest.
  if (diet === "keto") {
    const carbs_g = Math.min(
      KETO_CARBS_G,
      Math.max(0, Math.round((kcal - protein_g * 4) / 4)),
    );
    const fat_g = Math.max(
      0,
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

  const fat_g = Math.round((kcal * FAT_FRACTION_OF_KCAL) / 9);
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
export function deficitPerDay(pace: GoalPace, weightKg: number): number {
  const kgPerWeek = Math.min(
    PACE_KG_PER_WEEK[pace],
    MAX_WEEKLY_LOSS_FRACTION * weightKg,
  );
  return (kgPerWeek * KCAL_PER_KG) / 7;
}

// Full daily macro target for a user in a weight-loss deficit.
export function dailyTarget(input: CoachInput): Macros {
  const maintenance = tdee(input);
  const target = Math.max(
    maintenance - deficitPerDay(input.pace, input.weightKg),
    MIN_KCAL[input.sex],
  );
  return macrosForKcal(
    target,
    input.weightKg,
    input.diet,
    input.heightCm,
    input.goalWeightKg,
  );
}

// Monday (UTC) of the week that contains `date` — used to key daily_targets.
export function weekStart(date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// --- The weekly review ------------------------------------------------------
// Compare this week's trailing average weight to last week's and nudge the
// calorie target. Result-based (no AI): the rules read the scale + tape, not a
// recomputed TDEE, so a plateau gets a real cut rather than a guess.

// A healthy loss is ~0.5–1.0 % of bodyweight per week.
const HEALTHY_MIN_PCT = 0.005;
const HEALTHY_MAX_PCT = 0.01;
const CUT_STEP = 0.07; // trim 7 % when stalled
const ADD_STEP = 0.05; // add 5 % when dropping too fast

// Plain mean of a list of weights; null when the list is empty.
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface WeeklyReviewInput {
  sex: Sex;
  diet?: DietType; // defaults to "regular"; keeps a keto split on recompute
  thisWeekAvgKg: number; // trailing avg over the last 7 days
  lastWeekAvgKg: number | null; // avg over the 7 days before that
  waistDeltaCm: number | null; // latest waist − previous waist (− = shrinking)
  current: Macros; // the target in force now
  heightCm?: number; // caps the protein basis on recompute (same as onboarding)
  goalWeightKg?: number | null; // preferred target weight for the protein cap
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
    thisWeekAvgKg,
    lastWeekAvgKg,
    waistDeltaCm,
    sex,
    diet = "regular",
    heightCm,
    goalWeightKg,
  } = input;

  // Not enough history yet — hold and ask for another week.
  if (lastWeekAvgKg == null) {
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

  const changeKg = lastWeekAvgKg - thisWeekAvgKg; // + = lost
  const changePct = changeKg / lastWeekAvgKg;
  const lostText = `${Math.abs(changeKg).toFixed(1)} kg`;
  const floor = MIN_KCAL[sex];

  // Healthy rate → keep the target.
  if (changePct >= HEALTHY_MIN_PCT && changePct <= HEALTHY_MAX_PCT) {
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
  if (changePct > HEALTHY_MAX_PCT) {
    const newKcal = Math.round(current.kcal * (1 + ADD_STEP));
    return {
      macros: macrosForKcal(newKcal, thisWeekAvgKg, diet, heightCm, goalWeightKg),
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
    macros: macrosForKcal(newKcal, thisWeekAvgKg, diet, heightCm, goalWeightKg),
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
