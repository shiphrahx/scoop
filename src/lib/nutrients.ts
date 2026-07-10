// One place that defines every nutrient Scoop tracks: its label, unit, where it
// lives on a Macros object, and whether it's a goal to hit or a limit to stay
// under. The Plan-my-day breakdown, the Add-food readout, the Home bars and the
// coach targets all read from here so they always agree.

import type { Macros } from "@/lib/types";

export type NutrientKey =
  | "kcal"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber"
  | "sugar"
  | "satfat"
  | "sodium";

export interface NutrientDef {
  key: NutrientKey;
  label: string; // "Protein"
  short: string; // "P" — compact chip
  unit: "kcal" | "g" | "mg";
  field: keyof Macros; // where the value lives on an (extended) Macros
  // "goal" = aim to reach it (protein, fiber); "limit" = stay under (sugar,
  // saturates, sodium). kcal/carbs/fat read as goals for the bar direction.
  kind: "goal" | "limit";
  // Colour gradient for bars/marks.
  gradient: string;
}

// The full registry. kcal is the hero (shown as the ring), the rest are the
// selectable breakdown nutrients.
export const NUTRIENTS: Record<NutrientKey, NutrientDef> = {
  kcal: {
    key: "kcal", label: "Calories", short: "kcal", unit: "kcal",
    field: "kcal", kind: "goal",
    gradient: "linear-gradient(90deg, var(--g-teal), var(--g-blue))",
  },
  protein: {
    key: "protein", label: "Protein", short: "P", unit: "g",
    field: "protein_g", kind: "goal",
    gradient: "linear-gradient(90deg, var(--g-green), var(--g-teal))",
  },
  carbs: {
    key: "carbs", label: "Carbs", short: "C", unit: "g",
    field: "carbs_g", kind: "goal",
    gradient: "linear-gradient(90deg, var(--g-teal), var(--g-blue))",
  },
  fat: {
    key: "fat", label: "Fat", short: "F", unit: "g",
    field: "fat_g", kind: "goal",
    gradient: "linear-gradient(90deg, var(--g-blue), var(--accent))",
  },
  fiber: {
    key: "fiber", label: "Fiber", short: "Fib", unit: "g",
    field: "fiber_g", kind: "goal",
    gradient: "linear-gradient(90deg, var(--g-green), var(--g-teal))",
  },
  sugar: {
    key: "sugar", label: "Sugar", short: "Sug", unit: "g",
    field: "sugar_g", kind: "limit",
    gradient: "linear-gradient(90deg, var(--accent), var(--g-blue))",
  },
  satfat: {
    key: "satfat", label: "Saturates", short: "SFat", unit: "g",
    field: "satfat_g", kind: "limit",
    gradient: "linear-gradient(90deg, var(--accent), var(--g-blue))",
  },
  sodium: {
    key: "sodium", label: "Sodium", short: "Na", unit: "mg",
    field: "sodium_mg", kind: "limit",
    gradient: "linear-gradient(90deg, var(--accent), var(--g-blue))",
  },
};

// Nutrients the user can toggle in their breakdown (everything but the kcal hero).
export const SELECTABLE_NUTRIENTS: NutrientKey[] = [
  "protein", "carbs", "fat", "fiber", "sugar", "satfat", "sodium",
];

export const DEFAULT_NUTRIENT_PREFS: NutrientKey[] = ["protein", "carbs", "fat"];

// Coerce a stored prefs array (free-text from the DB) to known keys, in the
// registry's order, falling back to the default when empty/unknown.
export function normalizePrefs(raw: string[] | null | undefined): NutrientKey[] {
  const set = new Set(raw ?? []);
  const picked = SELECTABLE_NUTRIENTS.filter((k) => set.has(k));
  return picked.length ? picked : DEFAULT_NUTRIENT_PREFS;
}

// Read a nutrient's value off an (extended) Macros object.
export function valueOf(m: Macros, key: NutrientKey): number {
  const v = m[NUTRIENTS[key].field];
  return typeof v === "number" ? v : 0;
}

// Format a value with its unit: "34 g", "310 mg", "1800 kcal".
export function formatNutrient(value: number, key: NutrientKey): string {
  const { unit } = NUTRIENTS[key];
  const n = Math.round(value);
  return unit === "kcal" ? `${n}` : `${n} ${unit}`;
}
