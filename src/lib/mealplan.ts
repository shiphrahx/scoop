// Local, deterministic meal planner. Every pantry item already carries its
// per-100g macros, so building a day of meals is just arithmetic: classify each
// item by its dominant macro (protein / carb / fat), then SOLVE the grams of a
// protein + carb + fat source that land a meal on its macro budget. No AI, no
// network — the pantry is the whole source of truth.
//
// Accuracy: each meal is solved as a small linear system (grams of each source
// vs the protein/carbs/fat targets), and the day's first meal is a "balancer"
// sized to whatever the other meals left over — so the DAY totals land within a
// gram or two of target (well inside ±5), as long as the pantry has a protein,
// a carb AND a fat source to move each macro independently.

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

// Generous per-portion ceilings (grams) — a safety net against an absurd amount
// of one low-density food, set high enough not to bind in normal planning.
const CAP: Record<MacroKey, number> = {
  protein_g: 500,
  carbs_g: 600,
  fat_g: 150,
};
// Keep any portion of at least this many grams (finer than before, so the solve
// can hit the target closely). Below this a food isn't worth listing.
const MIN_PORTION = 2;

type MacroKey = "protein_g" | "carbs_g" | "fat_g";
const KEY_TO_100: Record<MacroKey, keyof PantryFood> = {
  protein_g: "protein_100g",
  carbs_g: "carbs_100g",
  fat_g: "fat_100g",
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

// Per-gram amount of one macro in a food.
const perGram = (food: PantryFood, key: MacroKey) =>
  (food[KEY_TO_100[key]] as number) / 100;

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

const ZERO: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
  };
}

// Solve a small (n≤3) linear system A·x = b by Gauss–Jordan with partial
// pivoting. Returns null when singular (e.g. two sources of the same macro).
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-9) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row[n]);
}

type Portion = { food: PantryFood; grams: number };

// Size a protein + carb + fat source so the meal hits its macro target. Each
// present source anchors one macro (protein→protein_g …); solving that square
// system hits every anchored macro exactly (three sources → all three macros).
// Falls back to a greedy fill if the system is singular. Grams are rounded to
// whole numbers and clamped; a negative solve (a macro already overshot by the
// other sources) drops to zero.
function buildMeal(
  target: Macros,
  protein: PantryFood | null,
  carb: PantryFood | null,
  fat: PantryFood | null,
): { portions: Portion[]; totals: Macros } {
  const srcs: { food: PantryFood; key: MacroKey }[] = [];
  if (protein && protein.protein_100g > 0)
    srcs.push({ food: protein, key: "protein_g" });
  if (carb && carb.carbs_100g > 0) srcs.push({ food: carb, key: "carbs_g" });
  if (fat && fat.fat_100g > 0) srcs.push({ food: fat, key: "fat_g" });

  let grams: number[] | null = null;
  if (srcs.length) {
    const A = srcs.map((si) => srcs.map((sj) => perGram(sj.food, si.key)));
    const b = srcs.map((si) => target[si.key]);
    grams = solveLinear(A, b);
  }
  if (!grams || grams.some((g) => !Number.isFinite(g))) {
    return greedyMeal(target, protein, carb, fat);
  }

  const portions: Portion[] = [];
  srcs.forEach((s, i) => {
    const g = clamp(Math.round(grams![i]), 0, CAP[s.key]);
    if (g >= MIN_PORTION) portions.push({ food: s.food, grams: g });
  });
  return { portions, totals: sumPortions(portions) };
}

// Fallback when the linear solve can't run: fill protein, then carbs, then fat
// in sequence. Less exact, but only reached for degenerate pantries.
function greedyMeal(
  target: Macros,
  protein: PantryFood | null,
  carb: PantryFood | null,
  fat: PantryFood | null,
): { portions: Portion[]; totals: Macros } {
  const portions: Portion[] = [];
  let needCarb = target.carbs_g;
  let needFat = target.fat_g;
  const push = (food: PantryFood, grams: number, key: MacroKey) => {
    const g = clamp(Math.round(grams), 0, CAP[key]);
    if (g >= MIN_PORTION) portions.push({ food, grams: g });
    return g;
  };
  if (protein && protein.protein_100g > 0) {
    const g = push(protein, target.protein_g / perGram(protein, "protein_g"), "protein_g");
    needCarb -= g * perGram(protein, "carbs_g");
    needFat -= g * perGram(protein, "fat_g");
  }
  if (carb && carb.carbs_100g > 0) {
    const g = push(carb, needCarb / perGram(carb, "carbs_g"), "carbs_g");
    needFat -= g * perGram(carb, "fat_g");
  }
  if (fat && fat.fat_100g > 0) {
    push(fat, needFat / perGram(fat, "fat_g"), "fat_g");
  }
  return { portions, totals: sumPortions(portions) };
}

function sumPortions(portions: Portion[]): Macros {
  return portions.reduce<Macros>(
    (s, { food, grams }) => addMacros(s, macrosOf(food, grams)),
    ZERO,
  );
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
function mealName(portions: Portion[]): string {
  const names = portions.map((p) => p.food.name);
  if (names.length === 0) return "Pantry meal";
  if (names.length === 1) return names[0];
  return `${names[0]} with ${names[1]}`;
}

function toPortions(chosen: Portion[]): MealPortion[] {
  return chosen.map((c) => ({ name: c.food.name, grams: c.grams }));
}

const roundMacros = (m: Macros): Macros => ({
  kcal: Math.round(m.kcal),
  protein_g: Math.round(m.protein_g),
  carbs_g: Math.round(m.carbs_g),
  fat_g: Math.round(m.fat_g),
});

// One macro's choice in the "plan my day" wizard:
//   null        → "suggest for me": use the densest pantry source of that macro
//   string      → a pantry item chosen by name
//   PantryFood  → a scanned barcode product, carrying its own per-100g macros
//                 (needn't be in the pantry — the user scanned exactly this)
export type DayPick = string | PantryFood | null;

// The carb / protein / fat the user chose. When `picks` is given the planner
// builds ONLY from these foods: nothing else from the pantry is added.
export interface DayPicks {
  carb: DayPick;
  protein: DayPick;
  fat: DayPick;
}

export interface PlanDayInput {
  pantry: PantryFood[];
  // Macros still to eat today (day target minus what's already logged).
  budget: Macros;
  // Macros of meals the user has planned but not eaten — budget around them.
  fixed: Macros;
  emptySlots: string[];
  // When set, restrict every meal to these chosen foods (see DayPicks).
  picks?: DayPicks;
}

// Fill each empty slot with a pantry meal so the day's totals land on target.
// Slots after the first each take an even share of what's left; the FIRST slot
// is the balancer — it's sized to the exact remainder, so rounding in the other
// meals can't push the day total off. Returns one slot per meal it could build.
export function planPantryDay(input: PlanDayInput): PlannedSlot[] {
  const { protein, carb, fat } = pools(input.pantry);
  const slots = input.emptySlots;
  const n = slots.length;
  if (n === 0) return [];

  // With explicit picks, every meal is built from the same three chosen foods —
  // a named pick wins, a null pick falls back to the densest source ("suggest
  // for me"). Without picks we rotate the pools for variety across the day.
  const picks = input.picks;
  // Resolve one pick to a food: a scanned product is used as-is (its own
  // macros); a name is looked up in the pantry; either falling back to the
  // densest source of that macro when it can't be found.
  const resolve = (pick: DayPick, fallback: PantryFood | null): PantryFood | null =>
    pick == null
      ? fallback
      : typeof pick === "string"
        ? byName(input.pantry, pick) ?? fallback
        : pick;
  const fixedProtein = picks ? resolve(picks.protein, protein[0] ?? null) : null;
  const fixedCarb = picks ? resolve(picks.carb, carb[0] ?? null) : null;
  const fixedFat = picks ? resolve(picks.fat, fat[0] ?? null) : null;
  const proteinFor = (i: number) => (picks ? fixedProtein : at(protein, i));
  const carbFor = (i: number) => (picks ? fixedCarb : at(carb, i));
  const fatFor = (i: number) => (picks ? fixedFat : at(fat, i));

  const left: Macros = {
    kcal: Math.max(0, input.budget.kcal - input.fixed.kcal),
    protein_g: Math.max(0, input.budget.protein_g - input.fixed.protein_g),
    carbs_g: Math.max(0, input.budget.carbs_g - input.fixed.carbs_g),
    fat_g: Math.max(0, input.budget.fat_g - input.fixed.fat_g),
  };
  const share: Macros = {
    kcal: left.kcal / n,
    protein_g: left.protein_g / n,
    carbs_g: left.carbs_g / n,
    fat_g: left.fat_g / n,
  };

  // Build the non-balancer slots first (rotating sources for variety) and track
  // what they used, so the balancer can fill the exact remainder.
  const built: ({ portions: Portion[]; totals: Macros } | null)[] =
    new Array(n).fill(null);
  let others = ZERO;
  for (let i = 1; i < n; i++) {
    const m = buildMeal(share, proteinFor(i), carbFor(i), fatFor(i));
    built[i] = m;
    others = addMacros(others, m.totals);
  }

  // The balancer: densest sources, targeting whatever the others left of the
  // day's budget — this is what keeps the day total on target.
  const balTarget: Macros = {
    kcal: Math.max(0, left.kcal - others.kcal),
    protein_g: Math.max(0, left.protein_g - others.protein_g),
    carbs_g: Math.max(0, left.carbs_g - others.carbs_g),
    fat_g: Math.max(0, left.fat_g - others.fat_g),
  };
  built[0] = buildMeal(balTarget, proteinFor(0), carbFor(0), fatFor(0));

  const out: PlannedSlot[] = [];
  slots.forEach((slot, i) => {
    const m = built[i];
    if (!m || m.portions.length === 0) return;
    out.push({
      slot,
      origin: "ai",
      name: mealName(m.portions),
      portions: toPortions(m.portions),
      swaps: [],
      why: "Portioned from your pantry to hit this meal's macros.",
      ...roundMacros(m.totals),
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
