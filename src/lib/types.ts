// Shared domain types for Scoop.

export type DietType =
  | "regular"
  | "vegetarian"
  | "vegan"
  | "pescatarian"
  | "keto"
  | "celiac";
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
  // Optional target weight (kg) and body-fat %. Body-fat unlocks the more
  // accurate Katch–McArdle calorie maths; null when the user hasn't given it.
  goal_weight_kg: number | null;
  body_fat_pct: number | null;
  meal_slots: string[];
  // How big each meal should be relative to the others: slot name -> relative
  // weight. Empty/missing means an even share per meal; a slot missing from a
  // non-empty map falls back to the mean of the listed weights.
  slot_weights: Record<string, number> | null;
  nutrient_prefs: string[];
  // IANA zone the user lives in ("Europe/London"). Decides where their day
  // starts — the server's clock is UTC and is not the user's day.
  timezone: string;
  onboarded_at: string | null;
}

// Default meal slots for a brand-new user (mirrors the DB column default).
export const DEFAULT_MEAL_SLOTS = ["Breakfast", "Lunch", "Snack", "Dinner"];

export interface Macros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  // Extra nutrients — optional so existing 4-field literals still type-check.
  // Populated when the source (Open Food Facts, pantry) carries them.
  fiber_g?: number;
  sugar_g?: number;
  satfat_g?: number;
  sodium_mg?: number;
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
  fiber_100g: number;
  sugar_100g: number;
  satfat_100g: number;
  sodium_mg_100g: number;
  pack_size_g: number | null;
}

// The extra per-100g nutrients a food can carry, alongside the core four.
// Grouped so the food shapes (OFF, pantry, plan item) share one definition.
export interface ExtraPer100g {
  fiber_100g: number;
  sugar_100g: number;
  satfat_100g: number;
  sodium_mg_100g: number;
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
// unit_g/unit_label carry OFF's serving when it names one (see OffProduct).
export interface OffCandidate extends ExtraPer100g {
  code: string | null;
  name: string;
  brand: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  pack_size_g: number | null;
  unit_g: number | null;
  unit_label: string | null;
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
// unit_g/unit_label describe one serving when OFF reports one ("1 bagel (85 g)"
// → unit_g 85, unit_label "bagel"), so a countable food can be logged per unit
// rather than weighed. Both null when OFF has no usable serving.
export interface OffProduct extends ExtraPer100g {
  barcode: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  pack_size_g: number | null;
  unit_g: number | null;
  unit_label: string | null;
}

// One grocery product read from its web page (per 100 g), for the pantry. Comes
// from the page's structured data / Open Food Facts when possible, AI otherwise.
export interface ParsedProduct extends ExtraPer100g {
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

// One ingredient in a suggested dish, with the exact amount to use. Macros are
// what that portion contributes (optional — older stored plans only have grams).
// The extras ride along too, so a meal's fibre/sugar/saturates/sodium survive
// being edited and re-summed, and the day's nutrient verdict can judge them.
export interface MealPortion {
  name: string;
  grams: number;
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sugar_g?: number;
  satfat_g?: number;
  sodium_mg?: number;
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

// A food the user added to a planned meal — found in their pantry or on Open
// Food Facts. Macros are per 100 g (as everywhere); grams is how much of it
// this meal uses, so the meal's totals are exact and editable.
export interface PlanItem extends ExtraPer100g {
  name: string;
  source: "pantry" | "off";
  off_barcode: string | null;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

// A search hit offered when the user is building a meal: a pantry item they
// already have, or an Open Food Facts product. pack_size_g seeds a sensible
// default portion.
export interface FoodChoice extends ExtraPer100g {
  name: string;
  source: "pantry" | "off";
  off_barcode: string | null;
  brand: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  pack_size_g: number | null;
}

// A food the user chose for one meal when planning their day — the app works
// out the grams, so a pick carries no amount, just per-100g macros and where it
// came from. pack_size_g caps a portion at what the pack holds (null = no cap).
export type MealPick = Omit<FoodChoice, "brand">;

// One meal in a saved day plan, tied to a named slot (Breakfast, Lunch, …).
// origin 'manual' = the user built it from foods they picked (`items`); 'ai' =
// a dish the app portioned from the user's per-meal picks (`picks` are the
// foods they chose; `portions` the solved grams — empty until "Build my day").
// logged_food_id is set once the user says they ate it.
export interface PlannedMeal extends Macros {
  id: string;
  date: string;
  slot: string;
  position: number;
  origin: "manual" | "ai";
  name: string;
  items: PlanItem[];
  picks: MealPick[];
  portions: MealPortion[];
  swaps: string[];
  why: string | null;
  logged_food_id: string | null;
}

// Sum any list of macro-bearing rows (food logs, planned meals) into one total.
export function sumMacros(rows: Macros[]): Required<Macros> {
  return rows.reduce<Required<Macros>>(
    (s, r) => ({
      kcal: s.kcal + Number(r.kcal),
      protein_g: s.protein_g + Number(r.protein_g),
      carbs_g: s.carbs_g + Number(r.carbs_g),
      fat_g: s.fat_g + Number(r.fat_g),
      fiber_g: s.fiber_g + Number(r.fiber_g ?? 0),
      sugar_g: s.sugar_g + Number(r.sugar_g ?? 0),
      satfat_g: s.satfat_g + Number(r.satfat_g ?? 0),
      sodium_mg: s.sodium_mg + Number(r.sodium_mg ?? 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, satfat_g: 0, sodium_mg: 0 },
  );
}

// Sum a list of picked foods into a meal's total macros (all nutrients).
export function sumItems(items: PlanItem[]): Required<Macros> {
  return items.reduce<Required<Macros>>(
    (s, it) => {
      const f = it.grams / 100;
      return {
        kcal: s.kcal + it.kcal_100g * f,
        protein_g: s.protein_g + it.protein_100g * f,
        carbs_g: s.carbs_g + it.carbs_100g * f,
        fat_g: s.fat_g + it.fat_100g * f,
        fiber_g: s.fiber_g + it.fiber_100g * f,
        sugar_g: s.sugar_g + it.sugar_100g * f,
        satfat_g: s.satfat_g + it.satfat_100g * f,
        sodium_mg: s.sodium_mg + it.sodium_mg_100g * f,
      };
    },
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, satfat_g: 0, sodium_mg: 0 },
  );
}

// What the AI returns for one slot when planning a whole day.
export interface PlannedSlot extends Macros {
  slot: string;
  origin: "manual" | "ai";
  name: string;
  portions: MealPortion[];
  swaps: string[];
  why: string;
}
