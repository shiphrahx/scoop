// Local, deterministic meal planner. Every pantry item already carries its
// per-100g macros, so building a day of meals is just arithmetic: classify each
// item by its dominant macro (protein / carb / fat), then solve the grams of a
// protein + carb + fat source that land a meal on its macro budget. No AI, no
// network — the pantry is the whole source of truth.

import { macroRole } from "@/lib/foodgroups";
import type {
  Macros,
  MealPortion,
  MealSuggestion,
  PlannedSlot,
} from "@/lib/types";

// A pantry item reduced to what the planner needs: a name and per-100g macros.
export interface PantryFood {
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

// Sensible per-meal portion ceilings (grams) so a single food can't blow up.
const MAX = { protein: 300, carb: 350, fat: 60 } as const;
// Drop any portion below this — not worth listing a smear of something.
const MIN_PORTION = 5;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const round5 = (n: number) => Math.round(n / 5) * 5;
const perG = (per100: number) => per100 / 100;

// The macros of `grams` of a food.
function macrosOf(food: PantryFood, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: food.kcal_100g * f,
    protein_g: food.protein_100g * f,
    carbs_g: food.carbs_100g * f,
    fat_g: food.fat_100g * f,
  };
}

function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
  };
}

const ZERO: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

// Solve one meal: size the protein source to the protein target, the carb
// source to the carbs still needed after it, then the fat source to top up the
// remaining fat. Greedy but explainable, and each source is a distinct food.
function buildMeal(
  target: Macros,
  protein: PantryFood | null,
  carb: PantryFood | null,
  fat: PantryFood | null,
): { portions: { food: PantryFood; grams: number }[]; totals: Macros } {
  const chosen: { food: PantryFood; grams: number }[] = [];
  let needCarb = target.carbs_g;
  let needFat = target.fat_g;

  if (protein && protein.protein_100g > 0) {
    const g = clamp(round5(target.protein_g / perG(protein.protein_100g)), 0, MAX.protein);
    if (g >= MIN_PORTION) {
      chosen.push({ food: protein, grams: g });
      needCarb -= g * perG(protein.carbs_100g);
      needFat -= g * perG(protein.fat_100g);
    }
  }

  if (carb && carb.carbs_100g > 0) {
    const g = clamp(round5(needCarb / perG(carb.carbs_100g)), 0, MAX.carb);
    if (g >= MIN_PORTION) {
      chosen.push({ food: carb, grams: g });
      needFat -= g * perG(carb.fat_100g);
    }
  }

  if (fat && fat.fat_100g > 0) {
    const g = clamp(round5(needFat / perG(fat.fat_100g)), 0, MAX.fat);
    if (g >= MIN_PORTION) chosen.push({ food: fat, grams: g });
  }

  const totals = chosen.reduce<Macros>(
    (s, { food, grams }) => addMacros(s, macrosOf(food, grams)),
    ZERO,
  );
  return { portions: chosen, totals };
}

// Split a food list into protein / carb / fat pools by dominant macro, each
// sorted so the densest source of that macro comes first.
function pools(pantry: PantryFood[]) {
  const protein: PantryFood[] = [];
  const carb: PantryFood[] = [];
  const fat: PantryFood[] = [];
  for (const f of pantry) {
    switch (macroRole(f)) {
      case "protein":
        protein.push(f);
        break;
      case "carb":
        carb.push(f);
        break;
      case "fat":
        fat.push(f);
        break;
    }
  }
  protein.sort((a, b) => b.protein_100g - a.protein_100g);
  carb.sort((a, b) => b.carbs_100g - a.carbs_100g);
  fat.sort((a, b) => b.fat_100g - a.fat_100g);
  return { protein, carb, fat };
}

const at = <T,>(arr: T[], i: number): T | null =>
  arr.length ? arr[i % arr.length] : null;

// A short dish name from its portions: "Chicken with Rice", or the single food.
function mealName(portions: { food: PantryFood }[]): string {
  const names = portions.map((p) => p.food.name);
  if (names.length === 0) return "Pantry meal";
  if (names.length === 1) return names[0];
  return `${names[0]} with ${names[1]}`;
}

function toPortions(chosen: { food: PantryFood; grams: number }[]): MealPortion[] {
  return chosen.map((c) => ({ name: c.food.name, grams: c.grams }));
}

const roundMacros = (m: Macros): Macros => ({
  kcal: Math.round(m.kcal),
  protein_g: Math.round(m.protein_g),
  carbs_g: Math.round(m.carbs_g),
  fat_g: Math.round(m.fat_g),
});

export interface PlanDayInput {
  pantry: PantryFood[];
  // Macros still to eat today (day target minus what's already logged).
  budget: Macros;
  // Macros of meals the user has planned but not eaten — budget around them.
  fixed: Macros;
  emptySlots: string[];
}

// Fill each empty slot with a pantry meal so the day's totals land on target.
// Splits what's left of the budget evenly across the empty slots and rotates
// through the pantry so meals vary. Returns one slot per meal it could build.
export function planPantryDay(input: PlanDayInput): PlannedSlot[] {
  const { protein, carb, fat } = pools(input.pantry);
  const n = input.emptySlots.length;
  if (n === 0) return [];

  const left: Macros = {
    kcal: Math.max(0, input.budget.kcal - input.fixed.kcal),
    protein_g: Math.max(0, input.budget.protein_g - input.fixed.protein_g),
    carbs_g: Math.max(0, input.budget.carbs_g - input.fixed.carbs_g),
    fat_g: Math.max(0, input.budget.fat_g - input.fixed.fat_g),
  };
  const perSlot: Macros = {
    kcal: left.kcal / n,
    protein_g: left.protein_g / n,
    carbs_g: left.carbs_g / n,
    fat_g: left.fat_g / n,
  };

  const out: PlannedSlot[] = [];
  input.emptySlots.forEach((slot, i) => {
    const { portions, totals } = buildMeal(
      perSlot,
      at(protein, i),
      at(carb, i),
      at(fat, i),
    );
    if (portions.length === 0) return;
    out.push({
      slot,
      origin: "ai",
      name: mealName(portions),
      portions: toPortions(portions),
      swaps: [],
      why: "Portioned from your pantry to hit this meal's macros.",
      ...roundMacros(totals),
    });
  });
  return out;
}

export interface SuggestInput {
  pantry: PantryFood[];
  // Macros the suggested dish should aim to fill.
  remaining: Macros;
  carb?: string | null; // a pantry item the user chose as the base carb
  protein?: string | null; // a pantry item the user chose as the protein
  count?: number;
}

const byName = (pantry: PantryFood[], name?: string | null): PantryFood | null =>
  name ? pantry.find((f) => f.name === name) ?? null : null;

// Suggest a few pantry dishes built around a chosen carb + protein (either may
// be omitted, in which case the densest pantry source is used). Variations come
// from rotating the fat source. Deterministic — same pantry, same ideas.
export function suggestPantryMeals(input: SuggestInput): MealSuggestion[] {
  const { protein: pPool, carb: cPool, fat: fPool } = pools(input.pantry);
  const count = input.count ?? 3;

  const protein = byName(input.pantry, input.protein) ?? pPool[0] ?? null;
  const carb = byName(input.pantry, input.carb) ?? cPool[0] ?? null;
  if (!protein && !carb) return [];

  // Fat sources to try in turn (plus "no added fat"), so each idea differs.
  const fatChoices: (PantryFood | null)[] = fPool.length
    ? [...fPool.slice(0, count - 1), null]
    : [null];

  const seen = new Set<string>();
  const out: MealSuggestion[] = [];
  for (const fat of fatChoices) {
    if (out.length >= count) break;
    const { portions, totals } = buildMeal(input.remaining, protein, carb, fat);
    if (portions.length === 0) continue;
    const key = portions.map((p) => `${p.food.name}:${p.grams}`).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    // Alternative sources the user could swap in.
    const swaps = [
      ...cPool.filter((f) => f !== carb).slice(0, 1),
      ...pPool.filter((f) => f !== protein).slice(0, 1),
    ].map((f) => f.name);
    out.push({
      name: mealName(portions),
      uses: portions.map((p) => p.food.name),
      portions: toPortions(portions),
      swaps,
      why: "Built from your pantry to fit the macros you have left.",
      ...roundMacros(totals),
    });
  }
  return out;
}
