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

import { macroRole, isVegetable, isProtein } from "@/lib/foodgroups";
import { cookedStapleFor } from "@/lib/freshfoods";
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
  // Barcode of the pantry row, when it came from a scan. Lets a saved pick be
  // matched back to its pantry row (for the current stock/pack cap) even when
  // the name has since been edited.
  off_barcode?: string | null;
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
  // Grams the user hand-set for this food. When present the planner HOLDS it at
  // this amount (snapped to whole units and capped by stock) instead of solving
  // it, and portions everything else around what's left — so a nudged ingredient
  // stays put while the day still lands on its macros. Null = free to portion.
  pinned_g?: number | null;
}

// A food the planner portions in WHOLE UNITS: a discrete item you eat whole — a
// bagel, an egg, a banana. A unit_g alone isn't enough: bulk staples (rice,
// pasta, couscous, quinoa, porridge) carry serving-size presets ("medium" rice =
// 200 g) for quick manual logging, but they're served BY WEIGHT. Snapping them
// to whole 200 g servings locked rice to a fixed portion and left no room for the
// rest of the day (issue #27), so a staple is weighable however its presets look.
export function isCountable(food: PantryFood): boolean {
  return !!(food.unit_g && food.unit_g > 0) && !cookedStapleFor(food.name);
}

// Snap a solved gram amount to what the user can actually serve: whole units
// for a countable food ("2 bagels" = 170 g, not 137 g), else the nearest gram.
export function snapGrams(grams: number, food: PantryFood): number {
  if (isCountable(food)) {
    return Math.round(grams / food.unit_g!) * food.unit_g!;
  }
  return Math.round(grams);
}

// The grams to actually serve of a food: whole units for a countable food, never
// more than the stock cap. A countable food is ALWAYS a whole number of units —
// nobody eats 3/4 of a bagel — so the cap is applied in units (floored), never
// mid-unit. Every portion the planner emits goes through this.
export function portionGrams(raw: number, food: PantryFood, cap: number): number {
  if (isCountable(food)) {
    const unit = food.unit_g!;
    const maxUnits = Math.floor(Math.max(0, cap) / unit);
    const units = Math.min(maxUnits, Math.max(0, Math.round(raw / unit)));
    return units * unit;
  }
  return clamp(Math.round(raw), 0, cap);
}

// Per-portion ceilings (grams) — the most of any one food a single meal may use,
// so the solver can't serve a plausible-but-absurd amount (half a kilo of vegan
// chicken) to chase a macro. Protein's is the tightest: dense mains are where a
// runaway solve does the most damage. High enough not to bind on normal reachable
// budgets; it only kicks in when the picks can't hit a macro any sane way.
const CAP: Record<MacroKey, number> = {
  protein_g: 350,
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
    const g = portionGrams(grams![i], s.food, capFor(s.food, s.key));
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
    const g = portionGrams(grams, food, capFor(food, key));
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
    // Only for a genuine countable — a bulk staple keeps its serving presets off
    // the plan so rice shows as weighable grams, not a locked "1 medium".
    ...(isCountable(c.food)
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
// lands as close as the picks allow while meal sizes bend first. Weighted per
// macro: protein is the anchor the whole plan is built to hit, so it (and carbs)
// stay heavy; FAT is deliberately lighter. Fat is "the rest" — chasing an exact
// fat gram count when the picked foods are lean would otherwise pile 500 g of
// the single fattiest food onto one plate (and drag all its protein there too)
// just to close a few grams of fat. A softer fat goal keeps portions realistic
// and lets fat land a little under when the picks can't reach it cleanly.
const DAY_WEIGHT: Record<MacroKey, number> = {
  protein_g: 30,
  carbs_g: 30,
  fat_g: 3,
};
// Tiny ridge keeps the normal equations solvable when two picks have identical
// macro profiles (it splits the grams evenly between them instead of failing).
const RIDGE = 1e-6;
// Below this a solved portion reads as "didn't really fit" and earns a warning.
const SMALL_PORTION = 10;

const MACRO_KEYS: MacroKey[] = ["protein_g", "carbs_g", "fat_g"];
// The macros a countable's whole-unit count is chosen to fit: the anchored ones.
// Fat is left out on purpose — it's the soft "rest" macro, so a fat shortfall
// can't push the planner into adding another whole portion of a dense food.
const UNIT_KEYS: MacroKey[] = ["protein_g", "carbs_g"];

// One vegetable serving, in grams. Vegetables are meal FILLERS, not a macro
// source: each picked veg gets a fixed serving per meal (capped by stock) instead
// of being grown by the solve to hit a carb/protein target — that's what keeps
// veg split evenly across meals and stops the solver piling 400 g of onion onto a
// plate to cover a meal with no real carb.
//
// The serving is sized by ENERGY, not a flat gram count: a filler should add a
// small, roughly equal amount to the plate whatever the veg, and you eat far more
// of a watery courgette than of a dense onion for the same serving. ~30 kcal is
// one "five a day" portion. Bounded so a near-zero-calorie veg (cucumber,
// lettuce) can't balloon and a dense one (carrot) can't shrink to a garnish.
const VEG_PORTION_KCAL = 30;
const VEG_MIN_G = 60;
const VEG_MAX_G = 200;
function vegServingG(food: PantryFood): number {
  const perG = food.kcal_100g / 100;
  const grams = perG > 0 ? VEG_PORTION_KCAL / perG : VEG_MAX_G;
  return clamp(Math.round(grams), VEG_MIN_G, VEG_MAX_G);
}

// A picked food the planner treats as a filler rather than a macro source: a
// vegetable, unless its name reads as a protein product too ("pea protein
// powder" is a protein, not a filler). Broccoli, peas and the like carry enough
// protein that macroRole calls them a protein source — but nobody eats them to
// hit a protein target, so name, not macros, decides here. Fillers get a fixed
// serving; sources are portioned by the solve.
const isFiller = (food: PantryFood) =>
  isVegetable(food.name) && !isProtein(food.name);

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

// Build and solve the weighted least-squares for a set of active variables. The
// rows are the day's three macro totals (weighted per macro) then each meal's
// share of each macro (soft). `pinnedDay`/`pinnedMeal` report macros already
// committed by foods held OUTSIDE this solve (snapped countable portions), so
// the active foods aim at what's LEFT of the day and of each meal's share.
function solvePicks(
  active: PickVar[],
  activeCaps: number[],
  slots: PickedSlotInput[],
  fractions: number[],
  budget: Macros,
  pinnedDay: (key: MacroKey) => number = () => 0,
  pinnedMeal: (slotIdx: number, key: MacroKey) => number = () => 0,
): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (const key of MACRO_KEYS) {
    const w = DAY_WEIGHT[key];
    A.push(active.map((v) => perGram(v.food, key) * w));
    b.push((Math.max(0, budget[key]) - pinnedDay(key)) * w);
  }
  slots.forEach((s, slotIdx) => {
    for (const key of MACRO_KEYS) {
      A.push(active.map((v) => (v.slotIdx === slotIdx ? perGram(v.food, key) : 0)));
      b.push(Math.max(0, budget[key]) * fractions[slotIdx] - pinnedMeal(slotIdx, key));
    }
  });
  return boundedLeastSquares(A, b, activeCaps);
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

  // Two kinds of food are HELD at a fixed amount and portioned OUTSIDE the solve;
  // the sources then aim at what's LEFT of the budget after them:
  //   - PINNED foods — an amount the user hand-set (they nudged the onions). Held
  //     exactly there, snapped to whole units and capped by stock, so a rebalance
  //     keeps their choice and moves everything else to stay on target.
  //   - FILLERS — vegetables the user picked. Each gets a fixed standard serving
  //     (see vegServingG), which keeps veg split evenly across meals and stops
  //     the solver growing 400 g of onion to cover a carb the real sources fill.
  // A pinned veg is held at the pinned amount, not the standard filler serving.
  const grams = new Array<number>(vars.length).fill(0);
  const isPinned = (food: PantryFood) => food.pinned_g != null && food.pinned_g >= 0;
  const pinnedIdx = vars.map((v, i) => (isPinned(v.food) ? i : -1)).filter((i) => i >= 0);
  const fillerIdx = vars
    .map((v, i) => (!isPinned(v.food) && isFiller(v.food) ? i : -1))
    .filter((i) => i >= 0);
  const sourceIdx = vars
    .map((v, i) => (!isPinned(v.food) && !isFiller(v.food) ? i : -1))
    .filter((i) => i >= 0);
  for (const i of pinnedIdx) {
    grams[i] = portionGrams(vars[i].food.pinned_g!, vars[i].food, caps[i]);
  }
  for (const i of fillerIdx) {
    grams[i] = portionGrams(vegServingG(vars[i].food), vars[i].food, caps[i]);
  }

  // What the held foods (pinned + fillers) already put on the day, and on each
  // meal's share, so the sources aim at what's LEFT. Same shape as the
  // countable-pin below; they all combine when present.
  const heldIdx = [...pinnedIdx, ...fillerIdx];
  const heldDay = (key: MacroKey) =>
    heldIdx.reduce((s, i) => s + perGram(vars[i].food, key) * grams[i], 0);
  const heldMeal = (slotIdx: number, key: MacroKey) =>
    heldIdx.reduce(
      (s, i) => (vars[i].slotIdx === slotIdx ? s + perGram(vars[i].food, key) * grams[i] : s),
      0,
    );

  const sourceVars = sourceIdx.map((i) => vars[i]);
  const sourceCaps = sourceIdx.map((i) => caps[i]);

  // Stage 1: portion every SOURCE food continuously so the day lands on its
  // budget (net of the held foods). With no sources at all (a meal of only veg
  // or only pinned foods) the held foods already stand on their own.
  if (sourceVars.length > 0) {
    const sol = solvePicks(
      sourceVars,
      sourceCaps,
      slots,
      fractions,
      input.budget,
      heldDay,
      heldMeal,
    );
    sourceIdx.forEach((i, k) => {
      grams[i] = sol[k];
    });
  }

  // Stage 2: countable SOURCES can only be served whole, so they can't fine-tune
  // the day the way a weighable source can. Instead of scaling a countable up to
  // chase a macro (a second, third whole portion of vegan mince), give each
  // picked countable ONE serving and let the WEIGHABLE sources grow to carry the
  // rest — a picked protein powder gets increased to cover leftover protein
  // rather than dropped so another whole portion of mince can be added (issue
  // #26). Extra whole units are added back only when they genuinely bring the day
  // closer than the weighable sources can on their own (e.g. the countable is the
  // only protein there). Only worth it when both kinds of source are present.
  const countableIdx = sourceIdx.filter((i) => isCountable(vars[i].food));
  const looseIdx = sourceIdx.filter((i) => !isCountable(vars[i].food));
  if (countableIdx.length > 0 && looseIdx.length > 0) {
    const unitG = (i: number) => vars[i].food.unit_g as number;
    // Whole units this food could serve given its stock cap, and its FLOOR — the
    // fewest units a picked food should carry: one serving (the user picked it),
    // or zero when there isn't stock for even one unit.
    const maxUnits = new Map<number, number>(
      countableIdx.map((i) => [i, Math.floor(Math.max(0, caps[i]) / unitG(i))]),
    );
    const floorUnits = (i: number) => (maxUnits.get(i)! > 0 ? 1 : 0);

    // Grams a set of unit counts puts on one macro across the day (or within one
    // slot when `inSlot` is given).
    const unitContribution = (
      units: Map<number, number>,
      key: MacroKey,
      inSlot?: number,
    ) =>
      countableIdx.reduce(
        (s, i) =>
          inSlot === undefined || vars[i].slotIdx === inSlot
            ? s + perGram(vars[i].food, key) * (units.get(i)! * unitG(i))
            : s,
        0,
      );

    // Solve the weighable sources against what's left after the held foods and
    // these countable units, then score how far the whole day lands from budget
    // (the same per-macro weighting the solve itself minimises).
    const evalUnits = (units: Map<number, number>) => {
      const looseGrams = solvePicks(
        looseIdx.map((i) => vars[i]),
        looseIdx.map((i) => caps[i]),
        slots,
        fractions,
        input.budget,
        (key) => heldDay(key) + unitContribution(units, key),
        (slotIdx, key) => heldMeal(slotIdx, key) + unitContribution(units, key, slotIdx),
      );
      // Score the unit count on the ANCHORED macros only (protein, carbs). Fat is
      // "the rest" — deliberately allowed to land under when the picks are lean
      // (see DAY_WEIGHT) — so a fat shortfall must never justify plating another
      // whole portion of a dense protein food to chase it.
      let residual = 0;
      for (const key of UNIT_KEYS) {
        let achieved = heldDay(key) + unitContribution(units, key);
        looseIdx.forEach((i, k) => {
          achieved += perGram(vars[i].food, key) * looseGrams[k];
        });
        const miss = Math.max(0, input.budget[key]) - achieved;
        residual += (DAY_WEIGHT[key] * miss) ** 2;
      }
      return { looseGrams, residual };
    };

    // Start every picked countable at one serving, then hill-climb: ADD a unit
    // only when it strictly tightens the day (never merely to match what the
    // weighable sources could absorb), and DROP one whenever that doesn't loosen
    // the day — so surplus is carried by the weighable sources, not by extra
    // whole portions. A picked food never drops below its floor of one serving:
    // the user chose it, so it always gets at least a single portion.
    const units = new Map<number, number>(
      countableIdx.map((i) => [i, floorUnits(i)]),
    );
    const EPS = 1e-6;
    // A whole portion is a big, lumpy commitment, so only add one when it pulls
    // the day MEANINGFULLY closer — at least ~1 g on an anchored macro. Without a
    // real margin, sub-gram numeric noise between unit counts (the weighable solve
    // re-balancing) would keep nudging the count up when the floor already fits.
    const ADD_MARGIN = Math.min(...UNIT_KEYS.map((k) => DAY_WEIGHT[k])) ** 2;
    let best = evalUnits(units);
    const steps = countableIdx.reduce((s, i) => s + maxUnits.get(i)! + 1, 0) * 2 + 4;
    for (let step = 0; step < steps; step++) {
      let moved = false;
      for (const i of countableIdx) {
        const cur = units.get(i)!;
        if (cur < maxUnits.get(i)!) {
          const trial = new Map(units).set(i, cur + 1);
          const r = evalUnits(trial);
          if (r.residual < best.residual - ADD_MARGIN) {
            units.set(i, cur + 1);
            best = r;
            moved = true;
            continue; // took the add — don't also weigh a drop this pass
          }
        }
        if (cur > floorUnits(i)) {
          const trial = new Map(units).set(i, cur - 1);
          const r = evalUnits(trial);
          if (r.residual <= best.residual + EPS) {
            units.set(i, cur - 1);
            best = r;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    looseIdx.forEach((i, k) => {
      grams[i] = best.looseGrams[k];
    });
    for (const i of countableIdx) grams[i] = units.get(i)! * unitG(i);
  }

  const out: PlannedSlot[] = [];
  slots.forEach((s, slotIdx) => {
    const portions: Portion[] = [];
    const warnings: string[] = [];
    s.foods.forEach((food) => {
      const i = vars.findIndex((v) => v.slotIdx === slotIdx && v.food === food);
      const g = portionGrams(grams[i], food, caps[i]);
      if (g < MIN_PORTION) {
        const why = isCountable(food)
          ? `Couldn't fit a whole ${food.unit_label ?? "unit"} of ${food.name} — it would push the day off target.`
          : `Couldn't fit ${food.name} — it would push the day off target.`;
        warnings.push(why);
        return;
      }
      // A tiny portion of anything but a fat source usually means the pick
      // didn't really fit; oils and butter are legitimately a few grams. A
      // pinned food is whatever amount the user chose, so it never earns this.
      if (g < SMALL_PORTION && macroRole(food) !== "fat" && !isPinned(food)) {
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
