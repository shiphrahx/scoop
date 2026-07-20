// Helpers for turning a fresh-food reference pick (banana + its small/medium/
// large sizes) into a pantry item's countable unit. Pure and deterministic, so
// they're cheap to unit-test and carry no dependency on the database.

import type { UnitOption } from "@/lib/types";

// What one selected size is called on a pantry item: "medium banana", so a plan
// or log can read "2 medium bananas". Folds the food name to lower case (the
// size label is already lower case in the reference) and trims both.
export function pantryUnitLabel(foodName: string, sizeLabel: string): string {
  const name = foodName.trim();
  const size = sizeLabel.trim();
  if (!size) return name.toLowerCase();
  if (!name) return size;
  return `${size} ${name}`.toLowerCase();
}

// The size a food defaults to when the user first adds it: "medium" if it has
// one, otherwise the middle size by weight (so a two-size food picks the
// smaller, a three-size food the true middle). Null when there are no sizes.
export function defaultSize(sizes: UnitOption[]): UnitOption | null {
  if (sizes.length === 0) return null;
  const medium = sizes.find((s) => s.label.trim().toLowerCase() === "medium");
  if (medium) return medium;
  const byGrams = [...sizes].sort((a, b) => a.grams - b.grams);
  return byGrams[Math.floor((byGrams.length - 1) / 2)];
}

// The macros a given weight of a per-100g food contributes. Kept here so the
// form and the tests compute a size's macros exactly one way.
export interface Per100 {
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

export interface UnitMacros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export function macrosForGrams(per100: Per100, grams: number): UnitMacros {
  const f = grams / 100;
  return {
    kcal: per100.kcal_100g * f,
    protein_g: per100.protein_100g * f,
    carbs_g: per100.carbs_100g * f,
    fat_g: per100.fat_100g * f,
  };
}
