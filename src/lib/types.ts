// Shared domain types for Scoop.

export type DietType = "regular" | "vegetarian" | "vegan";
export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type GoalPace = "gentle" | "steady" | "aggressive";
export type FoodSource = "batch" | "barcode" | "recipe" | "manual";

export interface Profile {
  id: string;
  email: string | null;
  diet_type: DietType;
  allergies: string[];
  dislikes: string[];
  goal: string;
  goal_pace: GoalPace;
  activity_level: ActivityLevel;
  height_cm: number;
  sex: Sex;
  birth_year: number;
  onboarded_at: string | null;
}

export interface Macros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface DailyTargets extends Macros {
  week_start: string;
}
