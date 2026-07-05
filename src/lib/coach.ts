import type {
  ActivityLevel,
  GoalPace,
  Macros,
  Sex,
} from "@/lib/types";

// The Coach math — pure functions, no AI. Mifflin–St Jeor BMR + activity
// multiplier = TDEE, minus a deficit for weight loss, split into macros.

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Fraction of TDEE removed for weight loss.
const PACE_DEFICIT: Record<GoalPace, number> = {
  gentle: 0.1,
  steady: 0.2,
  aggressive: 0.25,
};

// Never eat below this, whatever the maths say (safety floor).
const MIN_KCAL: Record<Sex, number> = {
  male: 1500,
  female: 1200,
};

const PROTEIN_G_PER_KG = 2.0; // high protein to protect muscle in a deficit
const FAT_FRACTION_OF_KCAL = 0.25;

export interface CoachInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  pace: GoalPace;
}

// Mifflin–St Jeor basal metabolic rate (kcal/day).
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function tdee(input: Omit<CoachInput, "pace">) {
  return bmr(input.sex, input.weightKg, input.heightCm, input.age) *
    ACTIVITY_MULTIPLIER[input.activity];
}

export function ageFromBirthYear(birthYear: number, now = new Date()) {
  return now.getFullYear() - birthYear;
}

// Split a calorie target into macros: fixed high protein (by bodyweight),
// a quarter of calories from fat, the rest from carbs.
export function macrosForKcal(kcal: number, weightKg: number): Macros {
  const protein_g = Math.round(weightKg * PROTEIN_G_PER_KG);
  const fat_g = Math.round((kcal * FAT_FRACTION_OF_KCAL) / 9);
  const carbs_g = Math.max(
    0,
    Math.round((kcal - protein_g * 4 - fat_g * 9) / 4),
  );
  return { kcal: Math.round(kcal), protein_g, carbs_g, fat_g };
}

// Full daily macro target for a user in a weight-loss deficit.
export function dailyTarget(input: CoachInput): Macros {
  const maintenance = tdee(input);
  const target = Math.max(
    maintenance * (1 - PACE_DEFICIT[input.pace]),
    MIN_KCAL[input.sex],
  );
  return macrosForKcal(target, input.weightKg);
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
  thisWeekAvgKg: number; // trailing avg over the last 7 days
  lastWeekAvgKg: number | null; // avg over the 7 days before that
  waistDeltaCm: number | null; // latest waist − previous waist (− = shrinking)
  current: Macros; // the target in force now
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
  const { current, thisWeekAvgKg, lastWeekAvgKg, waistDeltaCm, sex } = input;

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
      macros: macrosForKcal(newKcal, thisWeekAvgKg),
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
    macros: macrosForKcal(newKcal, thisWeekAvgKg),
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
