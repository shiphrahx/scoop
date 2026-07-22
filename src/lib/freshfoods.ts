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

// A dry staple's cooked reference food, keyed by the words that name it. Every
// macro in Scoop is as-eaten, so a scanned bag of dry rice/pasta must use these
// cooked entries (see 0020) instead of the pack's dry numbers. Brown rice sits
// before white so "brown rice" wins over the bare "rice" rule below it.
const COOKED_STAPLES: { canonical: string; words: string[] }[] = [
  { canonical: "Brown Rice (cooked)", words: ["brown rice", "wholegrain rice", "whole grain rice", "wholemeal rice"] },
  { canonical: "White Rice (cooked)", words: ["white rice", "rice", "basmati", "jasmine", "long grain"] },
  {
    canonical: "Pasta (cooked)",
    words: [
      "pasta", "spaghetti", "penne", "macaroni", "fusilli", "linguine",
      "tagliatelle", "rigatoni", "farfalle", "conchiglie", "rotini", "orzo",
    ],
  },
  { canonical: "Couscous (cooked)", words: ["couscous"] },
  { canonical: "Quinoa (cooked)", words: ["quinoa"] },
  { canonical: "Porridge (cooked)", words: ["porridge", "oatmeal", "rolled oats", "oats"] },
];

// Words that mean a DIFFERENT product than the plain dry staple, so a match must
// be blocked — using cooked-rice macros for rice milk or a rice cake would be
// wrong. Better to leave these to the pack/user than to substitute badly.
const NOT_PLAIN_STAPLE = [
  "milk", "drink", "pudding", "cake", "cracker", "snack", "flour", "noodle",
  "granola", "syrup", "juice", "fried", "risotto", "pilau", "pilaf", "bar",
  "cereal", "biscuit", "bread", "wine", "vinegar", "paper",
];

// Mark a food's own name cooked without losing it: "Basmati Rice" → "Basmati
// Rice (cooked)". Idempotent — an already-cooked name is returned unchanged, so
// re-adding never doubles the tag. Used when a dry staple is swapped onto the
// cooked reference's MACROS but must keep the user's product name, so distinct
// staples (penne, rigatoni, basmati) stay distinct instead of collapsing onto
// the shared "Pasta (cooked)" / "White Rice (cooked)" reference name.
export function cookedName(productName: string): string {
  const n = productName.trim();
  if (/\(cooked\)\s*$/i.test(n)) return n;
  return `${n} (cooked)`;
}

// The cooked reference staple a scanned/typed product name should use, or null
// when it isn't a plain dry staple. Conservative on purpose: a single
// disqualifying word (see NOT_PLAIN_STAPLE) blocks the swap. Whole-word matches
// only, so "priced" never reads as "rice".
export function cookedStapleFor(productName: string): string | null {
  const n = ` ${productName.toLowerCase()} `;
  if (NOT_PLAIN_STAPLE.some((d) => new RegExp(`\\b${d}`).test(n))) return null;
  for (const s of COOKED_STAPLES) {
    if (s.words.some((w) => new RegExp(`\\b${w}\\b`).test(n))) return s.canonical;
  }
  return null;
}
