// Alcohol logging maths — pure, no DB, no AI.
//
// Alcohol is 7 kcal/g and isn't protein, carb or fat. Scoop tracks only
// protein/carbs/fat, so a drink's alcohol calories are booked against carbs OR
// fat (the user's choice per drink), and any REAL drink carbs (beer sugars,
// wine residual sugar, mixers) are added as actual carbs on top. Booking uses
// each macro's own energy — carbs 4 kcal/g, fat 9 kcal/g — NOT alcohol's 7, so
// the gram figure carries the right number of calories into the daily total.

import type { Macros } from "@/lib/types";

// Ethanol density (g/ml) and its energy (kcal/g). alcoholCalories multiplies
// these with the volume and ABV fraction.
export const ETHANOL_DENSITY = 0.789;
export const KCAL_PER_G_ALCOHOL = 7;

// A sane ceiling so a fat-fingered "5000 ml" or "900%" can be caught. Not a law
// of nature — just far past any real single drink.
export const MAX_VOLUME_ML = 3000;
export const MAX_ABV_PCT = 100;

export type AlcoholAllocation = "carbs" | "fat" | "split";

// Grams of pure ethanol in a drink.
export function alcoholGrams(volumeMl: number, abvPct: number): number {
  if (!(volumeMl > 0) || !(abvPct > 0)) return 0;
  return volumeMl * (abvPct / 100) * ETHANOL_DENSITY;
}

// Calories from the alcohol itself (ethanol grams × 7). Real drink carbs are
// separate — see drinkMacros.
export function alcoholCalories(volumeMl: number, abvPct: number): number {
  return alcoholGrams(volumeMl, abvPct) * KCAL_PER_G_ALCOHOL;
}

// Book a block of alcohol calories onto carb and/or fat grams. Divide by the
// TARGET macro's kcal/g (4 or 9), never by alcohol's 7 — the point is to carry
// the same calories under a macro the app can track. "split" puts half the
// calories under each.
export function allocateAlcohol(
  alcoholKcal: number,
  allocation: AlcoholAllocation,
): { carbs_g: number; fat_g: number } {
  const k = Math.max(0, alcoholKcal);
  switch (allocation) {
    case "carbs":
      return { carbs_g: k / 4, fat_g: 0 };
    case "fat":
      return { carbs_g: 0, fat_g: k / 9 };
    case "split":
      return { carbs_g: k / 2 / 4, fat_g: k / 2 / 9 };
  }
}

export interface DrinkInput {
  volumeMl: number;
  abvPct: number;
  allocation: AlcoholAllocation;
  // Real, non-alcohol drink carbs: mixers, beer/wine residual sugar. Added as
  // actual carbs (and counted as sugar) on top of the booked alcohol calories.
  extraCarbsG?: number;
  // Real fat, e.g. a cream liqueur. Added as actual fat on top.
  extraFatG?: number;
  extraProteinG?: number;
}

export interface DrinkMacros extends Required<Macros> {
  // Pure ethanol grams, stored for history so a re-book (carbs↔fat) is exact.
  alcohol_g: number;
}

// Full macros for one drink: the booked alcohol calories plus any real carbs/
// fat/protein. kcal is the true energy (alcohol + real components), so the daily
// calorie total is right whichever way the alcohol is booked. Unrounded — round
// at the storage/display boundary.
export function drinkMacros(input: DrinkInput): DrinkMacros {
  const alcoholKcal = alcoholCalories(input.volumeMl, input.abvPct);
  const booked = allocateAlcohol(alcoholKcal, input.allocation);
  const extraCarbs = Math.max(0, input.extraCarbsG ?? 0);
  const extraFat = Math.max(0, input.extraFatG ?? 0);
  const protein_g = Math.max(0, input.extraProteinG ?? 0);

  return {
    kcal: alcoholKcal + extraCarbs * 4 + extraFat * 9 + protein_g * 4,
    protein_g,
    carbs_g: booked.carbs_g + extraCarbs,
    fat_g: booked.fat_g + extraFat,
    fiber_g: 0,
    // Mixer/residual carbs are sugars — surface them so the day's sugar reads true.
    sugar_g: extraCarbs,
    satfat_g: 0,
    sodium_mg: 0,
    alcohol_g: alcoholGrams(input.volumeMl, input.abvPct),
  };
}

// The allocation to default to: whichever macro the user has MORE of left today,
// so booking the drink is least likely to blow a macro. Ties and missing data
// fall back to carbs (the usual choice).
export function defaultAllocation(
  carbsLeft: number | null | undefined,
  fatLeft: number | null | undefined,
): AlcoholAllocation {
  const c = carbsLeft ?? 0;
  const f = fatLeft ?? 0;
  // Compare on calories, not grams — 20 g fat is far more room than 20 g carbs.
  return f * 9 > c * 4 ? "fat" : "carbs";
}

export interface DrinkPreset {
  id: string;
  name: string;
  volumeMl: number;
  abvPct: number;
  extraCarbsG: number;
}

// One-tap common drinks. Volumes are UK-standard; extra carbs are the drink's
// real (non-alcohol) carbs, so the maths only has to add the ethanol calories.
export const DRINK_PRESETS: DrinkPreset[] = [
  { id: "pint-lager", name: "Pint of lager", volumeMl: 568, abvPct: 4.5, extraCarbsG: 13 },
  { id: "wine-glass", name: "Glass of wine", volumeMl: 175, abvPct: 13, extraCarbsG: 2 },
  { id: "spirit-mixer", name: "Spirit + mixer", volumeMl: 25, abvPct: 40, extraCarbsG: 26 },
];
