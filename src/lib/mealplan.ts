// Local, deterministic meal planner. Every food already carries its per-100g
// macros, so portioning meals is just arithmetic — no AI, no network.
//
// Two solvers live here:
//  - planPickedDay: the user names the foods for EACH meal and one global
//    weighted least-squares portions everything together so the DAY lands on
//    its macro budget (within ±5 when the picks can reach it). Meal sizes
//    follow the user's slot weights, softly — they bend before the day total.
//  - suggestPantryMeals: dish ideas for ONE meal built around a chosen carb +
//    protein, each solved as a small linear system against the remaining
//    macros.

import { macroRole } from "@/lib/foodgroups";
import type {
  Macros,
  MealPortion,
  MealSuggestion,
  PlannedSlot,
} from "@/lib/types";

// A pantry item reduced to what the planner needs: a name, per-100g macros, and
// how much is actually in stock. available_g caps a portion — we can't suggest
// more tofu than the pack holds. Undefined means the amount is unknown (no pack
// size on the item), so no stock cap applies.
export interface PantryFood {
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  available_g?: number;
  // The extras the day's nutrient verdict judges. Optional: a scanned product
  // may not report them, and they don't take part in the portion solve — they
  // just come along for the ride so the planned day's fibre, sugar, saturates
  // and sodium are the real numbers instead of zero.
  fiber_100g?: number;
  sugar_100g?: number;
  satfat_100g?: number;
  sodium_mg_100g?: number;
  // A countable food's unit: grams in one unit and its name. When set, the
  // planner snaps this food's portion to a whole number of units (you can't eat
  // 1.6 bagels), and carries the label onto the portion so it shows as a count.
  unit_g?: number | null;
  unit_label?: string | null;
}

// Snap a solved gram amount to what the user can actually serve: whole units
// for a countable food ("2 bagels" = 170 g, not 137 g), else the nearest gram.
export function snapGrams(grams: number, food: PantryFood): number {
  if (food.unit_g && food.unit_g > 0) {
    return Math.round(grams / food.unit_g) * food.unit_g;
  }
  return Math.round(grams);
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

// The most grams of a food a single portion may use: the generous per-macro
// ceiling, but never more than what's in stock.
const capFor = (food: PantryFood, key: MacroKey) =>
  Math.min(CAP[key], food.available_g ?? Infinity);

// Per-gram amount of one macro in a food.
const perGram = (food: PantryFood, key: MacroKey) =>
  (food[KEY_TO_100[key]] as number) / 100;

// The macros of `grams` of a food, ROUNDED to whole numbers — the same figures
// the user is shown on the portion line. Every total downstream is summed from
// these, so a meal's total always equals the portions printed under it, and
// re-saving an untouched meal can't shift its numbers.
function macrosOf(food: PantryFood, grams: number): Required<Macros> {
  const f = grams / 100;
  return {
    kcal: Math.round(food.kcal_100g * f),
    protein_g: Math.round(food.protein_100g * f),
    carbs_g: Math.round(food.carbs_100g * f),
    fat_g: Math.round(food.fat_100g * f),
    fiber_g: Math.round((food.fiber_100g ?? 0) * f),
    sugar_g: Math.round((food.sugar_100g ?? 0) * f),
    satfat_g: Math.round((food.satfat_100g ?? 0) * f),
    sodium_mg: Math.round((food.sodium_mg_100g ?? 0) * f),
  };
}

const ZERO: Required<Macros> = {
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
  sugar_g: 0,
  satfat_g: 0,
  sodium_mg: 0,
};

function addMacros(a: Required<Macros>, b: Required<Macros>): Required<Macros> {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
    fiber_g: a.fiber_g + b.fiber_g,
    sugar_g: a.sugar_g + b.sugar_g,
    satfat_g: a.satfat_g + b.satfat_g,
    sodium_mg: a.sodium_mg + b.sodium_mg,
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
): { portions: Portion[]; totals: Required<Macros> } {
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
    const g = clamp(Math.round(grams![i]), 0, capFor(s.food, s.key));
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
): { portions: Portion[]; totals: Required<Macros> } {
  const portions: Portion[] = [];
  let needCarb = target.carbs_g;
  let needFat = target.fat_g;
  const push = (food: PantryFood, grams: number, key: MacroKey) => {
    const g = clamp(Math.round(grams), 0, capFor(food, key));
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

function sumPortions(portions: Portion[]): Required<Macros> {
  return portions.reduce<Required<Macros>>(
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

// A short dish name from its portions: "Chicken with Rice", or the single food.
function mealName(portions: Portion[]): string {
  const names = portions.map((p) => p.food.name);
  if (names.length === 0) return "Pantry meal";
  if (names.length === 1) return names[0];
  return `${names[0]} with ${names[1]}`;
}

function toPortions(chosen: Portion[]): MealPortion[] {
  return chosen.map((c) => ({
    name: c.food.name,
    grams: c.grams,
    ...macrosOf(c.food, c.grams),
    // Carry the unit through so the portion can be shown as a count ("2 bagels").
    ...(c.food.unit_g && c.food.unit_g > 0
      ? { unit_g: c.food.unit_g, unit_label: c.food.unit_label ?? null }
      : {}),
  }));
}

// ---------------------------------------------------------------------------
// Per-meal picks: the user chooses the foods for EACH meal ("pasta and vegan
// mince for lunch, a bagel and tofu for dinner") and one global solve portions
// everything together so the DAY lands on its macros. The solve is a weighted
// least-squares: hitting the day total dominates; each meal's share of the day
// (from the user's slot weights) is a soft preference it trades away when the
// chosen foods can't absorb their share.
// ---------------------------------------------------------------------------

export interface PickedSlotInput {
  slot: string;
  foods: PantryFood[];
}

export interface PlanPickedDayInput {
  // Only slots the user picked foods for; every food is used in its meal.
  slots: PickedSlotInput[];
  // What the picked meals together should sum to (day target minus what's
  // already eaten and minus meals pinned elsewhere).
  budget: Macros;
  // Slot name -> relative meal size. Empty/undefined = even shares; a slot
  // missing from a non-empty map gets the mean of the listed weights.
  weights?: Record<string, number>;
}

// Day-total residuals cost DAY_WEIGHT² times a slot-share residual, so the day
// lands as close as the picks allow while meal sizes bend first.
const DAY_WEIGHT = 30;
// Tiny ridge keeps the normal equations solvable when two picks have identical
// macro profiles (it splits the grams evenly between them instead of failing).
const RIDGE = 1e-6;
// Below this a solved portion reads as "didn't really fit" and earns a warning.
const SMALL_PORTION = 10;

const MACRO_KEYS: MacroKey[] = ["protein_g", "carbs_g", "fat_g"];

// The relative size of each picked slot, normalised to fractions summing to 1.
function slotFractions(
  slots: string[],
  weights?: Record<string, number>,
): number[] {
  const given = Object.values(weights ?? {})
    .map(Number)
    .filter((w) => Number.isFinite(w) && w > 0);
  const mean = given.length
    ? given.reduce((a, b) => a + b, 0) / given.length
    : 1;
  const raw = slots.map((s) => {
    const w = Number(weights?.[s]);
    return Number.isFinite(w) && w > 0 ? w : mean;
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => (sum > 0 ? w / sum : 1 / slots.length));
}

// One variable of the global solve: the grams of one food in one meal.
type PickVar = { slotIdx: number; food: PantryFood };

// Solve min ||A·x − b||² (rows pre-scaled by their weights) with x ≥ 0 and
// x ≤ cap, by normal equations plus an active set: solve unconstrained, then
// pin the worst out-of-bounds variable to its bound and re-solve, until every
// free variable is in range. Bounded by 2n iterations.
function boundedLeastSquares(
  A: number[][],
  b: number[],
  caps: number[],
): number[] {
  const n = caps.length;
  const x = new Array<number>(n).fill(0);
  // null = free; otherwise pinned to that value (0 or its cap).
  const pinned = new Array<number | null>(n).fill(null);

  for (let iter = 0; iter <= 2 * n; iter++) {
    const free: number[] = [];
    for (let j = 0; j < n; j++) if (pinned[j] == null) free.push(j);
    if (free.length === 0) break;

    // b minus what the pinned variables already contribute.
    const bAdj = b.map(
      (bi, r) =>
        bi -
        pinned.reduce<number>(
          (s, p, j) => (p != null ? s + A[r][j] * p : s),
          0,
        ),
    );

    // Normal equations over the free variables: (AᵀA + εI)x = Aᵀb.
    const M = free.map((j1) =>
      free.map(
        (j2) =>
          A.reduce((s, row) => s + row[j1] * row[j2], 0) +
          (j1 === j2 ? RIDGE : 0),
      ),
    );
    const rhs = free.map((j) => A.reduce((s, row, r) => s + row[j] * bAdj[r], 0));
    const sol = solveLinear(M, rhs);
    if (!sol) break; // ridge makes this unreachable, but never loop on it

    // Pin the worst out-of-bounds variable (negative → 0, over cap → its cap)
    // and re-solve; done when every free variable is in range.
    let worst = -1;
    let worstBy = 1e-9;
    for (let k = 0; k < free.length; k++) {
      const j = free[k];
      x[j] = sol[k];
      const by = Math.max(-sol[k], sol[k] - caps[j]);
      if (by > worstBy) {
        worstBy = by;
        worst = j;
      }
    }
    if (worst === -1) return x.map((v, j) => pinned[j] ?? v);
    pinned[worst] = x[worst] < 0 ? 0 : caps[worst];
  }
  return x.map((v, j) => pinned[j] ?? Math.max(0, Math.min(caps[j], v)));
}

// Portion every picked meal in one go so the day's totals land on the budget.
// Returns one PlannedSlot per meal that ended up with any food; warnings about
// picks that had to shrink or be dropped land in that meal's `why`.
export function planPickedDay(input: PlanPickedDayInput): PlannedSlot[] {
  const slots = input.slots.filter((s) => s.foods.length > 0);
  if (slots.length === 0) return [];

  const fractions = slotFractions(
    slots.map((s) => s.slot),
    input.weights,
  );

  // One variable per (meal, food).
  const vars: PickVar[] = slots.flatMap((s, slotIdx) =>
    s.foods.map((food) => ({ slotIdx, food })),
  );

  // Per-portion gram ceiling: the generous per-macro cap for the food's role,
  // and never more than the stock. A food picked into several meals shares its
  // stock evenly between them (a deliberate simplification).
  const occurrences = new Map<string, number>();
  for (const v of vars)
    occurrences.set(v.food.name, (occurrences.get(v.food.name) ?? 0) + 1);
  const caps = vars.map((v) => {
    const role = macroRole(v.food);
    const roleCap =
      role === "protein"
        ? CAP.protein_g
        : role === "carb"
          ? CAP.carbs_g
          : role === "fat"
            ? CAP.fat_g
            : 400;
    const stock =
      v.food.available_g != null
        ? v.food.available_g / (occurrences.get(v.food.name) ?? 1)
        : Infinity;
    return Math.min(roleCap, stock);
  });

  // Rows: the day's three macro totals (heavily weighted), then each meal's
  // share of each macro (softly weighted).
  const A: number[][] = [];
  const b: number[] = [];
  for (const key of MACRO_KEYS) {
    A.push(vars.map((v) => perGram(v.food, key) * DAY_WEIGHT));
    b.push(Math.max(0, input.budget[key]) * DAY_WEIGHT);
  }
  slots.forEach((s, slotIdx) => {
    for (const key of MACRO_KEYS) {
      A.push(
        vars.map((v) =>
          v.slotIdx === slotIdx ? perGram(v.food, key) : 0,
        ),
      );
      b.push(Math.max(0, input.budget[key]) * fractions[slotIdx]);
    }
  });

  const grams = boundedLeastSquares(A, b, caps);

  const out: PlannedSlot[] = [];
  slots.forEach((s, slotIdx) => {
    const portions: Portion[] = [];
    const warnings: string[] = [];
    s.foods.forEach((food) => {
      const i = vars.findIndex((v) => v.slotIdx === slotIdx && v.food === food);
      const g = clamp(snapGrams(grams[i], food), 0, caps[i]);
      if (g < MIN_PORTION) {
        const why = food.unit_g
          ? `Couldn't fit a whole ${food.unit_label ?? "unit"} of ${food.name} — it would push the day off target.`
          : `Couldn't fit ${food.name} — it would push the day off target.`;
        warnings.push(why);
        return;
      }
      // A tiny portion of anything but a fat source usually means the pick
      // didn't really fit; oils and butter are legitimately a few grams.
      if (g < SMALL_PORTION && macroRole(food) !== "fat") {
        warnings.push(`${food.name} came out small (${g} g) to keep the day on target.`);
      }
      portions.push({ food, grams: g });
    });
    // A whole meal can fall out when there's no budget left for it; the caller
    // sees it's missing from the result and explains on the slot.
    if (portions.length === 0) return;
    const totals = sumPortions(portions);
    out.push({
      slot: s.slot,
      origin: "ai",
      name: mealName(portions),
      portions: toPortions(portions),
      swaps: [],
      why:
        warnings.length > 0
          ? warnings.join(" ")
          : "Portioned with the rest of your day so the whole day hits your macros.",
      ...totals,
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
      ...totals,
    });
  }
  return out;
}
