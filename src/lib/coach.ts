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

// Full daily macro target for a user in a weight-loss deficit.
export function dailyTarget(input: CoachInput): Macros {
  const maintenance = tdee(input);
  const target = Math.max(
    maintenance * (1 - PACE_DEFICIT[input.pace]),
    MIN_KCAL[input.sex],
  );

  const protein_g = Math.round(input.weightKg * PROTEIN_G_PER_KG);
  const fat_g = Math.round((target * FAT_FRACTION_OF_KCAL) / 9);

  const proteinKcal = protein_g * 4;
  const fatKcal = fat_g * 9;
  const carbs_g = Math.max(
    0,
    Math.round((target - proteinKcal - fatKcal) / 4),
  );

  return {
    kcal: Math.round(target),
    protein_g,
    carbs_g,
    fat_g,
  };
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
