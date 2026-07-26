// Local, deterministic meal planner. Every food already carries its per-100g
// macros, so portioning meals is just arithmetic — no AI, no network.
//
// ONE solve does the portioning, and it is set up as the app's requirements
// really are:
//
//  - Which foods appear is NOT the solve's decision. Every food the user picked
//    that the pantry can cover gets a portion, between its smallest sensible
//    serving and the most anyone would eat of it (whole units where the food is
//    countable, never more than the pack holds).
//  - The day's numbers are CEILINGS. Energy and every macro are pressed back
//    under their limit rather than traded against each other: a plan that eats
//    the deficit is a failed plan, however neatly the rest of it fits.
//  - Under those ceilings the solve fills the day as fully as it can — energy
//    first, then protein, then the carb/fat split, with each meal's share of the
//    day as a soft preference that bends before any of them.
//  - When the picks cannot reach the target without breaking a limit, the plan
//    SAYS so — how far under, which macro is at its limit, and where the gap is —
//    instead of quietly dropping a food or reporting success it didn't have.
//
// planPickedDay portions a whole day of picked meals. suggestPantryMeals builds
// dish ideas for ONE meal around a chosen carb + protein and portions each of
// them through the same solve.

import { solveBoxLsq } from "@/lib/boxqp";
import { macroRole, isVegetable, isProtein } from "@/lib/foodgroups";
import { isBulkStaple } from "@/lib/freshfoods";
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
// rest of the day (issue #27), so a staple is weighable however its presets look
// — and however it was sold, dry bag or steamed pouch.
export function isCountable(food: PantryFood): boolean {
  return !!(food.unit_g && food.unit_g > 0) && !isBulkStaple(food.name);
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

type MacroKey = "protein_g" | "carbs_g" | "fat_g";
// A row of the day solve: the three macros plus total energy. Energy is not an
// extra macro, it's the sum of them — but giving it its own row makes the solve
// keep the day's CALORIES honest even where a single macro has to bend.
type RowKey = MacroKey | "kcal";
const KEY_TO_100: Record<RowKey, keyof PantryFood> = {
  protein_g: "protein_100g",
  carbs_g: "carbs_100g",
  fat_g: "fat_100g",
  kcal: "kcal_100g",
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

// Per-gram amount of one macro (or of energy) in a food.
const perGram = (food: PantryFood, key: RowKey) =>
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

type Portion = { food: PantryFood; grams: number };

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

// What the fit is scored on, in the order the app actually cares about. Each row
// measures the FRACTION its total misses the budget by, so a row counted in kcal
// and a row counted in grams are comparable and the weights below mean what they
// say:
//
//  - ENERGY first. Calories decide whether the week works; they used to have no
//    row at all, which let a day land hundreds of kcal off while every macro
//    "hit" and the plan reported success.
//  - PROTEIN next. It's the macro a cut is built to protect.
//  - CARBS and FAT last. Once energy and protein hold, these two only trade
//    against each other, and the picked foods decide how cleanly they can.
//
// Meal SIZES (the user's slot weights) are a preference, not a target: they bend
// before any day total does.
const ROW_WEIGHT: Record<RowKey, number> = {
  kcal: 10,
  protein_g: 6,
  carbs_g: 3,
  fat_g: 2,
};
const SHARE_WEIGHT = 3;
// A row is scaled by its budget, so a tiny budget doesn't turn a 2 g miss into a
// vast residual. Below these floors the scale stops shrinking.
const ROW_SCALE_FLOOR: Record<RowKey, number> = {
  kcal: 300,
  protein_g: 30,
  carbs_g: 30,
  fat_g: 15,
};

const MACRO_KEYS: MacroKey[] = ["protein_g", "carbs_g", "fat_g"];
const ROW_KEYS: RowKey[] = ["kcal", ...MACRO_KEYS];

// A day's numbers are CEILINGS, not two-sided goals. Landing under is a gap the
// user can fill by eating more; landing over is the deficit gone, and no amount
// of "the picks couldn't reach it" makes that acceptable. So energy, carbs and
// fat are re-solved with their weight multiplied whenever the plan exceeds them,
// until nothing is over its limit or the picks make that impossible. (Protein is
// not in the list: eating over your protein target isn't a failure, and its
// calories are already answered for by the energy row.)
//
// Weights escalate rather than being high from the start: a heavy overshoot
// penalty applied always would distort every ordinary day, where the fit lands
// inside its limits anyway.
const LIMIT_KEYS: RowKey[] = ["kcal", "protein_g", "carbs_g", "fat_g"];
const OVER_FACTOR = 8;
const OVER_PASSES = 4;
// How far past a limit still counts as landing on it: whole grams and rounded
// label energy can't hit a number exactly.
const overBy = (total: number, limit: number, key: RowKey) =>
  total - limit - (key === "kcal" ? Math.max(20, limit * 0.01) : Math.max(2, limit * 0.01));

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

// ---------------------------------------------------------------------------
// Serving bounds. These are the planner's HARD limits on one portion of one food
// in one meal, and they carry the two rules the fit itself must not be allowed to
// decide: a food the user picked is on the plate at a recognisable serving, and
// no food is served in an amount nobody would eat.
// ---------------------------------------------------------------------------

// The least amount of a food worth putting on a plate. Sized by ENERGY like a veg
// serving, so it reads as a real serving of THAT food: a fat spread lands around
// 10 g, a sauce around a spoonful, an oil a few grams. Bounded so a dense food
// can't shrink to a smear and a light one can't take a meaningful bite out of the
// budget just for being a floor.
const MIN_SERVE_KCAL = 60;
const MIN_SERVE_MIN_G = 5;
const MIN_SERVE_MAX_G = 40;
export function minServingG(food: PantryFood): number {
  const perG = food.kcal_100g / 100;
  const grams = perG > 0 ? MIN_SERVE_KCAL / perG : MIN_SERVE_MAX_G;
  return clamp(Math.round(grams), MIN_SERVE_MIN_G, MIN_SERVE_MAX_G);
}

// The most of a food that belongs in ONE meal. The old ceilings were per-macro
// constants (350 g of any protein, 600 g of any carb), which let the fit serve
// 600 g of potatoes or six eggs to close a macro. A serving is bounded three
// ways instead: by energy (no single food is half a day on its own), by a
// realistic mass for its role, and — for a countable — by a plausible number of
// whole units. Stock still caps everything.
const MAX_SERVE_KCAL = 500;
const MAX_SERVE_UNITS = 4;
const MAX_SERVE_G: Record<"protein" | "carb" | "fat" | "other", number> = {
  protein: 350,
  carb: 350,
  fat: 60,
  other: 250,
};
export function maxServingG(food: PantryFood, cap = Infinity): number {
  const perG = food.kcal_100g / 100;
  const byEnergy = perG > 0 ? MAX_SERVE_KCAL / perG : Infinity;
  const byRole = MAX_SERVE_G[macroRole(food) ?? "other"];
  // Floored, never rounded: a cap that rounds up can put two meals of the same
  // food past the pack between them.
  const most = Math.floor(Math.min(byEnergy, byRole, Math.max(0, cap)));
  if (isCountable(food)) {
    // Whole units, and never more of them than the same energy and mass limits
    // allow — four bagels is as unreasonable as 400 g of loose bread.
    const unit = food.unit_g!;
    const units = Math.min(MAX_SERVE_UNITS, Math.floor(most / unit));
    return Math.max(0, units) * unit;
  }
  return most;
}

// The smallest servable amount of a picked food: one whole unit for a countable
// (you can't serve a third of a bagel), else its energy-sized minimum serving —
// never more than the stock, and never more than one sensible serving. Zero means
// the pack can't cover even the minimum.
export function floorPortion(food: PantryFood, cap: number): number {
  const most = maxServingG(food, cap);
  if (most <= 0) return 0;
  const want = isCountable(food) ? food.unit_g! : minServingG(food);
  return Math.min(portionGrams(want, food, cap), most);
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

// How a picked food gets its grams:
//  - "pinned": the user hand-set this amount, so it is held there.
//  - "filler": a vegetable — a fixed standard serving, which keeps veg even
//    across meals instead of being grown to cover a missing carb.
//  - "source": everything else. The solve chooses the grams, between the food's
//    smallest and largest sensible serving.
type PickKind = "pinned" | "filler" | "source";

// One picked food, ready to solve: where it sits, and the window it may take.
interface PickSlotVar extends PickVar {
  kind: PickKind;
  stock: number; // grams of this food available to THIS meal (Infinity = unknown)
  lo: number; // smallest servable amount; 0 means the pack can't cover a serving
  hi: number; // largest sensible amount
}

// The rows of the day model, for a given set of FREE variables. Every variable
// not in `freeIdx` is fixed at `grams[i]` — pinned foods, veg servings, and any
// whole-unit count already chosen — so the free foods aim at what is left of the
// day and of each meal's share.
function dayModel(
  vars: PickSlotVar[],
  freeIdx: number[],
  grams: number[],
  fractions: number[],
  slotCount: number,
  budget: Macros,
  // Per-row multipliers, raised on a row the plan has gone OVER (see LIMIT_KEYS).
  press: Record<RowKey, number>,
): { A: number[][]; b: number[] } {
  const free = new Set(freeIdx);
  const scaleOf = (key: RowKey) =>
    Math.max(ROW_SCALE_FLOOR[key], Math.max(0, budget[key] ?? 0));
  const fixedTotal = (key: RowKey, slotIdx?: number) =>
    vars.reduce(
      (s, v, i) =>
        !free.has(i) && (slotIdx === undefined || v.slotIdx === slotIdx)
          ? s + perGram(v.food, key) * grams[i]
          : s,
      0,
    );

  const A: number[][] = [];
  const b: number[] = [];
  // The day's totals: what the plan is really judged on.
  for (const key of ROW_KEYS) {
    const w = (ROW_WEIGHT[key] * press[key]) / scaleOf(key);
    A.push(freeIdx.map((i) => perGram(vars[i].food, key) * w));
    b.push((Math.max(0, budget[key] ?? 0) - fixedTotal(key)) * w);
  }
  // Each meal's share of the day, at a much lower weight: a preference for meal
  // sizes that bends before any day total does.
  for (let slotIdx = 0; slotIdx < slotCount; slotIdx++) {
    for (const key of ROW_KEYS) {
      // Pressed alongside the day row it belongs to, so that holding a limit
      // doesn't quietly stop meal sizes mattering — two meals with the same picks
      // should still come out the same size.
      const w = (SHARE_WEIGHT * Math.sqrt(press[key])) / scaleOf(key);
      A.push(
        freeIdx.map((i) =>
          vars[i].slotIdx === slotIdx ? perGram(vars[i].food, key) * w : 0,
        ),
      );
      b.push(
        (Math.max(0, budget[key] ?? 0) * fractions[slotIdx] -
          fixedTotal(key, slotIdx)) *
          w,
      );
    }
  }
  return { A, b };
}

// What a complete set of portions costs on the model above — the same measure the
// solve minimises, so whole-unit candidates can be compared on it.
function modelCost(
  vars: PickSlotVar[],
  grams: number[],
  fractions: number[],
  slotCount: number,
  budget: Macros,
  press: Record<RowKey, number>,
): number {
  const scaleOf = (key: RowKey) =>
    Math.max(ROW_SCALE_FLOOR[key], Math.max(0, budget[key] ?? 0));
  const total = (key: RowKey, slotIdx?: number) =>
    vars.reduce(
      (s, v, i) =>
        slotIdx === undefined || v.slotIdx === slotIdx
          ? s + perGram(v.food, key) * grams[i]
          : s,
      0,
    );
  let cost = 0;
  for (const key of ROW_KEYS) {
    const target = Math.max(0, budget[key] ?? 0);
    const r = ((total(key) - target) * ROW_WEIGHT[key] * press[key]) / scaleOf(key);
    cost += r * r;
  }
  for (let slotIdx = 0; slotIdx < slotCount; slotIdx++) {
    for (const key of ROW_KEYS) {
      const target = Math.max(0, budget[key] ?? 0) * fractions[slotIdx];
      const r =
        ((total(key, slotIdx) - target) * SHARE_WEIGHT * Math.sqrt(press[key])) /
        scaleOf(key);
      cost += r * r;
    }
  }
  return cost;
}

// How much better the day has to get before a SECOND (third, fourth) whole
// portion of a countable food is worth adding. The cost is a sum of squared
// fractional misses, so 0.01 is roughly "a tenth of one row's budget" — enough
// that a real gap justifies another portion and a rounding wobble does not.
const EXTRA_UNIT_MARGIN = 0.05;

// A day is "on target" for energy within this many kcal. Wider than a macro's ±5
// because portions are whole grams and every food's label energy is itself
// rounded; narrow enough that a real miss is reported as one.
const ON_TARGET_KCAL = 50;

const isPinnedFood = (food: PantryFood) =>
  food.pinned_g != null && food.pinned_g >= 0;

// Portion every picked meal in one go: one solve, with the app's requirements as
// BOUNDS (every pick gets at least one real serving, nothing gets an amount
// nobody would eat, nothing exceeds the pack) and the day's energy, protein and
// macro split as the rows it is scored on.
//
// What the solve is NOT allowed to decide is which foods appear. A least squares
// left free to zero a portion will do exactly that whenever it is the cheapest
// way to fit — which is how a picked sauce got dropped while the chips kept their
// full portion (#28), how a protein powder was squeezed out so a second whole
// portion of mince could fit (#26), and how a fixed rice serving ate the day
// (#27). Every pick the pantry can cover is on the plate here, and the portions
// move around it.
export function planPickedDay(input: PlanPickedDayInput): PlannedSlot[] {
  const slots = input.slots.filter((s) => s.foods.length > 0);
  if (slots.length === 0) return [];

  const fractions = slotFractions(
    slots.map((s) => s.slot),
    input.weights,
  );

  // One variable per (meal, food). A food picked into several meals shares its
  // stock evenly between them (a deliberate simplification).
  const plain: PickVar[] = slots.flatMap((s, slotIdx) =>
    s.foods.map((food) => ({ slotIdx, food })),
  );
  const occurrences = new Map<string, number>();
  for (const v of plain)
    occurrences.set(v.food.name, (occurrences.get(v.food.name) ?? 0) + 1);

  const vars: PickSlotVar[] = plain.map((v) => {
    const stock =
      v.food.available_g != null
        ? v.food.available_g / (occurrences.get(v.food.name) ?? 1)
        : Infinity;
    if (isPinnedFood(v.food)) {
      // The user's own amount, only ever trimmed to what the pack holds.
      const g = portionGrams(v.food.pinned_g!, v.food, stock);
      return { ...v, kind: "pinned", stock, lo: g, hi: g };
    }
    if (isFiller(v.food)) {
      const g = portionGrams(vegServingG(v.food), v.food, stock);
      return { ...v, kind: "filler", stock, lo: g, hi: g };
    }
    const lo = floorPortion(v.food, stock);
    return {
      ...v,
      kind: "source",
      stock,
      lo,
      hi: Math.max(lo, maxServingG(v.food, stock)),
    };
  });

  // Held foods (pinned, veg) sit at their fixed amount; sources are what moves.
  const freeIdx = vars
    .map((v, i) => (v.kind === "source" && v.lo > 0 ? i : -1))
    .filter((i) => i >= 0);

  // Solve the day at a given per-row pressure. Called again with a heavier hand on
  // any row the plan has gone OVER, because a day's numbers are ceilings.
  const solveAt = (press: Record<RowKey, number>): number[] => {
    const grams = vars.map((v) => v.lo);
    if (freeIdx.length > 0) {
      const { A, b } = dayModel(
        vars,
        freeIdx,
        grams,
        fractions,
        slots.length,
        input.budget,
        press,
      );
      const x = solveBoxLsq(
        A,
        b,
        freeIdx.map((i) => vars[i].lo),
        freeIdx.map((i) => vars[i].hi),
        { start: freeIdx.map((i) => vars[i].lo) },
      );
      freeIdx.forEach((i, k) => {
        grams[i] = x[k];
      });

      // Countable foods are served in whole units, so their grams come from a unit
      // COUNT. Start at the count nearest the continuous solve, then move one unit
      // at a time while that lowers the model cost, re-solving the weighable foods
      // around each candidate. Scored on the same cost as everything else, so an
      // extra whole portion has to earn its place on the whole day — it can't be
      // added to close one macro while energy runs away.
      const unitIdx = freeIdx.filter((i) => isCountable(vars[i].food));
      const looseIdx = freeIdx.filter((i) => !isCountable(vars[i].food));
      if (unitIdx.length > 0) {
        const unitG = (i: number) => vars[i].food.unit_g!;
        const bounds = (i: number) => {
          const min = Math.max(1, Math.round(vars[i].lo / unitG(i)));
          return { min, max: Math.max(min, Math.floor(vars[i].hi / unitG(i))) };
        };
        const solveWith = (counts: Map<number, number>) => {
          const trial = [...grams];
          for (const [i, n] of counts) trial[i] = n * unitG(i);
          if (looseIdx.length > 0) {
            const m = dayModel(
              vars,
              looseIdx,
              trial,
              fractions,
              slots.length,
              input.budget,
              press,
            );
            const sol = solveBoxLsq(
              m.A,
              m.b,
              looseIdx.map((i) => vars[i].lo),
              looseIdx.map((i) => vars[i].hi),
              { start: looseIdx.map((i) => trial[i]) },
            );
            looseIdx.forEach((i, k) => {
              trial[i] = sol[k];
            });
          }
          return {
            grams: trial,
            cost: modelCost(vars, trial, fractions, slots.length, input.budget, press),
          };
        };

        // Start at ONE serving each: the user picked the food, so it gets a
        // portion, and the weighable foods grow to carry whatever is left. A second
        // whole portion is a lumpy commitment, so it is only added when it makes
        // the whole day MEANINGFULLY better — otherwise a picked protein powder
        // gets squeezed out so another whole portion of mince can fit (issue #26).
        const counts = new Map<number, number>(unitIdx.map((i) => [i, bounds(i).min]));
        let best = solveWith(counts);
        for (let sweep = 0; sweep < 6; sweep++) {
          let moved = false;
          for (const i of unitIdx) {
            const { min, max } = bounds(i);
            for (const d of [1, -1]) {
              const n = (counts.get(i) as number) + d;
              if (n < min || n > max) continue;
              const trial = new Map(counts).set(i, n);
              const r = solveWith(trial);
              // Adding a portion has to clear the margin; dropping one only has to
              // not be worse, so the count never drifts up on numeric noise.
              const better =
                d > 0
                  ? r.cost < best.cost - EXTRA_UNIT_MARGIN
                  : r.cost <= best.cost + 1e-9;
              if (better) {
                counts.set(i, n);
                best = r;
                moved = true;
              }
            }
          }
          if (!moved) break;
        }
        for (let i = 0; i < grams.length; i++) grams[i] = best.grams[i];
      }
    }
    return grams;
  };

  // Totals a set of portions comes to, on one row.
  const totalOn = (g: number[], key: RowKey) =>
    vars.reduce((s, v, i) => s + perGram(v.food, key) * g[i], 0);

  // First pass at the ordinary weights, then press down on whatever exceeded its
  // limit and solve again. Each pass keeps the best answer seen: the one that
  // exceeds its limits least, and among equals the one that fits the day best.
  const press: Record<RowKey, number> = { kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1 };
  const excessOf = (g: number[]) =>
    LIMIT_KEYS.reduce((s, key) => {
      const over = overBy(totalOn(g, key), Math.max(0, input.budget[key] ?? 0), key);
      return s + (over > 0 ? (over * ROW_WEIGHT[key]) / Math.max(1, input.budget[key] ?? 1) : 0);
    }, 0);

  let grams: number[] = solveAt(press);
  let bestExcess = excessOf(grams);
  for (let pass = 0; pass < OVER_PASSES && bestExcess > 0; pass++) {
    let pressed = false;
    for (const key of LIMIT_KEYS) {
      if (overBy(totalOn(grams, key), Math.max(0, input.budget[key] ?? 0), key) > 0) {
        press[key] *= OVER_FACTOR;
        pressed = true;
      }
    }
    if (!pressed) break;
    const next = solveAt(press);
    const nextExcess = excessOf(next);
    if (nextExcess < bestExcess - 1e-9) {
      grams = next;
      bestExcess = nextExcess;
    } else if (nextExcess <= bestExcess + 1e-9) {
      // No worse on the limits: take it, since it was solved under more pressure.
      grams = next;
      bestExcess = nextExcess;
      break;
    } else {
      break;
    }
  }

  // Pressing a limit down is a blunt instrument: it can leave the day short of
  // its calories while there is still headroom under every ceiling. So finish by
  // FILLING — grow portions, largest energy gain first and hungriest meal first,
  // as far as the ceilings and the serving windows allow. Nothing here can push a
  // total past its limit; it only takes back room the pressure gave away.
  // A cushion under each ceiling, so the rounding to whole grams that happens
  // after this can't tip a total over the limit the fill just filled to.
  const FILL_CUSHION: Record<RowKey, number> = {
    kcal: 8,
    protein_g: 1,
    carbs_g: 1,
    fat_g: 1,
  };
  const headroom = (g: number[], key: RowKey) => {
    const limit = Math.max(0, input.budget[key] ?? 0);
    if (limit <= 0) return 0;
    return limit - FILL_CUSHION[key] - totalOn(g, key);
  };
  for (let round = 0; round < 30; round++) {
    const gap = headroom(grams, "kcal");
    if (gap <= 1) break;
    // How much each meal is under its own share of the day's energy, so the
    // filling doesn't all land on one plate.
    const slotGap = fractions.map((frac, slotIdx) => {
      const want = Math.max(0, input.budget.kcal ?? 0) * frac;
      const has = vars.reduce(
        (s, v, i) => (v.slotIdx === slotIdx ? s + perGram(v.food, "kcal") * grams[i] : s),
        0,
      );
      return want - has;
    });
    let bestIdx = -1;
    let bestStep = 0;
    let bestScore = 0;
    for (const i of freeIdx) {
      const v = vars[i];
      let step = v.hi - grams[i];
      if (isCountable(v.food)) step = 0; // whole units only; handled by the solve
      for (const key of LIMIT_KEYS) {
        const per = perGram(v.food, key);
        if (per <= 0) continue;
        step = Math.min(step, headroom(grams, key) / per);
      }
      const perKcal = perGram(v.food, "kcal");
      if (perKcal > 0) step = Math.min(step, gap / perKcal);
      if (step < 1) continue;
      // Energy this would add, favouring the meal that is furthest under its share.
      const score = step * perKcal * (1 + Math.max(0, slotGap[v.slotIdx]) / 500);
      if (score > bestScore) {
        bestScore = score;
        bestStep = step;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    grams[bestIdx] += bestStep;
  }

  // Grams as they will be served: whole units for a countable, never past the
  // food's window. A pick with any window at all keeps at least its serving.
  const served = vars.map((v, i) =>
    v.lo <= 0 ? 0 : Math.max(v.lo, portionGrams(grams[i], v.food, v.hi)),
  );

  const dayTotals = vars.reduce<Required<Macros>>(
    (s, v, i) => (served[i] > 0 ? addMacros(s, macrosOf(v.food, served[i])) : s),
    ZERO,
  );
  const kcalMiss = dayTotals.kcal - Math.max(0, input.budget.kcal ?? 0);
  // Are the sources already as small as they go? Then the day being over is the
  // picks' doing, not the portioning's, and the note says so.
  const atSmallest = vars.every((v, i) => v.kind !== "source" || served[i] <= v.lo);

  // Which macros are sitting AT their limit. When the day lands short, this is
  // the reason: nothing can grow without breaking one of them, and the user is
  // better told which than left to wonder why the plan under-feeds them.
  const MACRO_LABEL: Record<MacroKey, string> = {
    protein_g: "protein",
    carbs_g: "carbs",
    fat_g: "fat",
  };
  const atLimit = MACRO_KEYS.filter((key) => {
    const limit = Math.max(0, input.budget[key] ?? 0);
    return limit > 0 && dayTotals[key] >= limit - Math.max(2, limit * 0.02);
  });
  const listed = atLimit.map((k) => MACRO_LABEL[k]);
  const blocking =
    listed.length === 0
      ? ""
      : listed.length === 1
        ? ` Your ${listed[0]} is already at its limit for the day, so nothing else can grow.`
        : ` Your ${listed.slice(0, -1).join(", ")} and ${listed[listed.length - 1]} are already at their limits for the day, so nothing else can grow.`;

  // Which macro the missing calories actually are. "You're 300 under" is not much
  // use on its own; "the gap is fat" tells the user what to go and pick.
  const KCAL_PER_G: Record<MacroKey, number> = { protein_g: 4, carbs_g: 4, fat_g: 9 };
  const gaps = MACRO_KEYS.map((key) => ({
    key,
    short: Math.max(0, Math.max(0, input.budget[key] ?? 0) - dayTotals[key]),
  })).sort((a, b) => b.short * KCAL_PER_G[b.key] - a.short * KCAL_PER_G[a.key]);
  const biggest = gaps[0];
  const gapNote =
    biggest && biggest.short * KCAL_PER_G[biggest.key] >= 100
      ? ` Most of the gap is ${MACRO_LABEL[biggest.key]} — ${biggest.short} g short.`
      : "";

  // Over its limit is reported as soon as it is measurably over; under gets the
  // wider band, because a day a little short is not a failure worth a warning.
  const kcalSlack = Math.max(20, Math.max(0, input.budget.kcal ?? 0) * 0.01);
  const energyNote =
    kcalMiss <= kcalSlack && kcalMiss >= -ON_TARGET_KCAL
      ? null
      : kcalMiss > 0
        ? atSmallest
          ? `Even at their smallest sensible servings these picks come to ${dayTotals.kcal} kcal — ${kcalMiss} over today's target. Take something out to bring the day back.`
          : `This day comes to ${dayTotals.kcal} kcal — ${kcalMiss} over today's target, the closest these picks get.`
        : `This day comes to ${dayTotals.kcal} kcal — ${-kcalMiss} under today's target.${blocking || " Add to your picks to fill the gap."}${gapNote}`;

  // Any macro that still ends up OVER its limit gets named. With the limits
  // pressed hard this only happens when the picks' smallest servings already
  // exceed the day, which is a fact the user needs rather than a silent overshoot.
  const overNotes = MACRO_KEYS.filter((key) => {
    const limit = Math.max(0, input.budget[key] ?? 0);
    return limit > 0 && overBy(dayTotals[key], limit, key) > 0;
  }).map(
    (key) =>
      `${MACRO_LABEL[key][0].toUpperCase()}${MACRO_LABEL[key].slice(1)} lands ${dayTotals[key] - Math.max(0, input.budget[key] ?? 0)} g over — these picks don't go any smaller.`,
  );

  // Protein SHORT is worth saying too: on a cut it's the macro that keeps muscle.
  const proteinTarget = Math.max(0, input.budget.protein_g ?? 0);
  const proteinShort = proteinTarget - dayTotals.protein_g;
  const proteinNote =
    proteinShort > Math.max(10, proteinTarget * 0.1)
      ? `Protein lands ${proteinShort} g under — these picks can't carry more of it.`
      : null;
  const dayNote =
    [energyNote, ...overNotes, proteinNote].filter(Boolean).join(" ") || null;

  const out: PlannedSlot[] = [];
  slots.forEach((s, slotIdx) => {
    const portions: Portion[] = [];
    const notes: string[] = [];
    s.foods.forEach((food) => {
      const i = vars.findIndex((v) => v.slotIdx === slotIdx && v.food === food);
      if (served[i] <= 0) {
        // The only reason a pick misses the plate now: the pantry hasn't got
        // enough of it for one serving.
        const left = Number.isFinite(vars[i].stock)
          ? `${Math.max(0, Math.round(vars[i].stock))} g`
          : "none";
        notes.push(
          isCountable(food)
            ? `No whole ${food.unit_label ?? "unit"} of ${food.name} left (${left}) — restock it and rebuild.`
            : `Not enough ${food.name} left (${left}) for a serving — restock it and rebuild.`,
        );
        return;
      }
      portions.push({ food, grams: served[i] });
    });
    if (portions.length === 0) return;
    const totals = sumPortions(portions);
    // The day-level note goes on the first meal only: it's a fact about the whole
    // day, and repeating it under every meal would just be noise.
    const why = [
      ...notes,
      ...(out.length === 0 && dayNote ? [dayNote] : []),
    ];
    out.push({
      slot: s.slot,
      origin: "ai",
      name: mealName(portions),
      portions: toPortions(portions),
      swaps: [],
      why: why.length
        ? why.join(" ")
        : "Portioned with the rest of your day so the whole day lands on your target.",
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
    const foods = [protein, carb, fat].filter((f): f is PantryFood => f != null);
    const uniq = foods.filter(
      (f, i) => foods.findIndex((x) => x.name === f.name) === i,
    );
    // Portioned by the same solve the day plan uses, as a single meal against
    // what's left of the day: every ingredient in the idea gets a real serving,
    // none of them an amount nobody would eat, and the note says where the meal
    // lands rather than claiming it fits.
    const [meal] = planPickedDay({
      slots: [{ slot: "Meal", foods: uniq }],
      budget: input.remaining,
    });
    if (!meal || meal.portions.length === 0) continue;
    const key = meal.portions.map((p) => `${p.name}:${p.grams}`).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const swaps = [
      ...cPool.filter((f) => f !== carb).slice(0, 1),
      ...pPool.filter((f) => f !== protein).slice(0, 1),
    ].map((f) => f.name);
    out.push({
      name: meal.name,
      uses: meal.portions.map((p) => p.name),
      portions: meal.portions,
      swaps,
      why: meal.why ?? "Built from your pantry to fit the macros you have left.",
      kcal: meal.kcal,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fat_g: meal.fat_g,
    });
  }
  return out;
}
