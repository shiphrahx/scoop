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
export type ActivitySource = "fitbit" | "apple" | "manual";

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

// A saved "my usual" item — logged to today's food with one tap.
export interface Favourite extends Macros {
  id: string;
  name: string;
  grams: number | null;
}

// Something the user has in the kitchen. Macros are stored per 100 g, the way
// Open Food Facts reports them. off_barcode is null for hand-entered items.
export interface PantryItem {
  id: string;
  name: string;
  off_barcode: string | null;
  quantity: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  pack_size_g: number | null;
}

// A raw line parsed from an import source (PDF invoice, pasted list, or a
// grocery screenshot) before we've matched it to a food. quantity is how many
// packs; unit is free text as written ("kg", "x2") or null.
export interface ImportedItem {
  name: string;
  quantity: number;
  unit: string | null;
}

// One Open Food Facts search hit offered to the user as a match for an
// ImportedItem. Macros are per 100 g; pack_size_g comes from OFF "quantity".
export interface OffCandidate {
  code: string | null;
  name: string;
  brand: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  pack_size_g: number | null;
}

// One pack that went into a batch cook.
export interface SourcePack {
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// A batch cook: totals for the whole pot, plus how much is left. Macros per
// gram = total macro / total_cooked_g.
export interface Batch extends Macros {
  id: string;
  name: string;
  source_packs: SourcePack[];
  total_cooked_g: number;
  remaining_g: number;
}

// What Open Food Facts gives us back for a scanned barcode (per 100 g).
export interface OffProduct {
  barcode: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  pack_size_g: number | null;
}

// One line of a parsed recipe.
export interface RecipeIngredient {
  name: string;
  quantity: string; // free text as written, e.g. "200 g" or "2 cloves"
}

// A recipe read by AI from a URL or screenshot. Macros are for the whole
// recipe as written (divide by servings for one plate).
export interface Recipe extends Macros {
  id: string;
  name: string;
  source_url: string | null;
  servings: number;
  ingredients: RecipeIngredient[];
}

// A single grocery item the AI read out of a screenshot (macros per 100 g,
// estimated from the model's knowledge — 0 when unknown).
export interface GroceryItem {
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

// One day of activity, from Fitbit (pulled) or Apple Health Auto Export
// (pushed). Any field can be null when that source didn't report it.
export interface Activity {
  date: string;
  steps: number | null;
  workout_kcal: number | null;
  sleep_hours: number | null;
  source: ActivitySource;
}

// One ingredient in a suggested dish, with the exact amount to use.
export interface MealPortion {
  name: string;
  grams: number;
}

// One dish the AI suggests from the pantry that fits the user's diet and
// remaining macros for the day, with exact portions and possible swaps.
export interface MealSuggestion {
  name: string;
  uses: string[]; // pantry item names it draws on
  portions: MealPortion[]; // exact grams per ingredient to hit the macros
  swaps: string[]; // optional ingredient swaps ("brown rice → quinoa")
  why: string; // one plain-language line
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}
