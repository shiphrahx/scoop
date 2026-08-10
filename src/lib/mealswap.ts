// Smart swaps: when the foods the user picked cannot reach the day's macros,
// work out whether something ELSE in their pantry would.
//
// The day solver (lib/mealplan) never changes which foods appear, and it should
// not: the picks are the user's. But "this day comes to 295 kcal under target,
// most of the gap is carbs" leaves them to work out on their own that the rice
// they picked has 77 g left in the pack while there is a full bag of pasta in
// the pantry. That is a search, and the app can run it.
//
// So: re-solve the day with ONE pick traded for one pantry food of the same
// role, score each result the same way the solve scores itself, and if a trade
// lands the day meaningfully closer, offer it. Nothing is applied here; the
// caller shows it as a prompt, and only a yes changes the plan.

import { macroRole } from "@/lib/foodgroups";
import {
  dayMissScore,
  isFillerFood,
  maxServingG,
  floorPortion,
  planPickedDay,
  ON_TARGET_KCAL,
  type PantryFood,
  type PickedSlotInput,
} from "@/lib/mealplan";
import type { Macros } from "@/lib/types";

export interface DaySwapInput {
  // Exactly what planPickedDay was given, so the search re-solves the real day.
  slots: PickedSlotInput[];
  budget: Macros;
  weights?: Record<string, number>;
  // Everything the user has in stock, already filtered to what they can eat.
  pantry: PantryFood[];
}

// One trade to offer: take `from` out of `slot`, put `to` in, rebalance.
export type DaySwap = {
  slot: string;
  from: string;
  to: string;
  // Plain words for what is wrong now, and the trade being offered.
  reason: string;
  summary: string;
  // Where the day lands as picked, and where it would land after the swap.
  before: Macros;
  after: Macros;
};

type MacroKey = "protein_g" | "carbs_g" | "fat_g";
const MACRO_KEYS: MacroKey[] = ["protein_g", "carbs_g", "fat_g"];
const KCAL_PER_G: Record<MacroKey, number> = { protein_g: 4, carbs_g: 4, fat_g: 9 };
const MACRO_LABEL: Record<MacroKey, string> = {
  protein_g: "protein",
  carbs_g: "carbs",
  fat_g: "fat",
};

// How many pantry alternatives are tried per picked food, and how many solves
// the whole search may run. Each trial is a full day solve, so the search is
// bounded rather than exhaustive: the candidates are ranked first (see
// deliverable below), and the ranking puts the swap that can actually close the
// gap at the top.
const CANDIDATES_PER_PICK = 4;
const MAX_TRIALS = 24;

// How much better the day has to get before a swap is worth putting to the
// user. Changing what someone planned to eat is not free, so a trade has to
// close a real gap, not shave a few calories off one that already lands.
const MIN_GAIN = 0.25;
const MIN_KCAL_GAIN = 40;

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const sumMeals = (meals: Array<Macros>): Macros =>
  meals.reduce<Macros>(
    (s, m) => ({
      kcal: s.kcal + m.kcal,
      protein_g: s.protein_g + m.protein_g,
      carbs_g: s.carbs_g + m.carbs_g,
      fat_g: s.fat_g + m.fat_g,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

// The grams of one macro a food could put on the day at its biggest sensible
// serving, given the stock actually left. This is what separates two foods that
// look identical on the label: 77 g of rice left in the pack can deliver 17 g of
// carbs, a full bag of pasta can deliver ten times that.
function deliverable(food: PantryFood, key: MacroKey): number {
  const per100 =
    key === "protein_g"
      ? food.protein_100g
      : key === "carbs_g"
        ? food.carbs_100g
        : food.fat_100g;
  const cap = food.available_g ?? Infinity;
  return (per100 / 100) * maxServingG(food, cap);
}

// Where a day sits against its budget, in the words the prompt uses.
function describe(totals: Macros, budget: Macros): string {
  const kcalMiss = Math.round(totals.kcal - Math.max(0, budget.kcal));
  const energy =
    kcalMiss < 0
      ? `${Math.round(totals.kcal)} kcal, ${-kcalMiss} under target`
      : kcalMiss > 0
        ? `${Math.round(totals.kcal)} kcal, ${kcalMiss} over target`
        : `${Math.round(totals.kcal)} kcal, on target`;
  const worst = MACRO_KEYS.map((key) => ({
    key,
    off: Math.round((budget[key] ?? 0) - totals[key]),
  }))
    .filter((m) => Math.abs(m.off) * KCAL_PER_G[m.key] >= 60)
    .sort((a, b) => Math.abs(b.off) * KCAL_PER_G[b.key] - Math.abs(a.off) * KCAL_PER_G[a.key])[0];
  if (!worst) return energy;
  return `${energy}, with ${MACRO_LABEL[worst.key]} ${Math.abs(worst.off)} g ${worst.off > 0 ? "short" : "over"}`;
}

// Is this day off target enough to go looking for a swap at all? A day inside
// its energy band with no macro badly out is the plan working; nobody wants a
// prompt to change their dinner over 20 kcal.
function needsHelp(totals: Macros, budget: Macros): boolean {
  const kcal = Math.max(0, budget.kcal);
  if (kcal <= 0) return false;
  const miss = totals.kcal - kcal;
  if (miss < -ON_TARGET_KCAL) return true;
  if (miss > Math.max(20, kcal * 0.01)) return true;
  return MACRO_KEYS.some((key) => {
    const target = Math.max(0, budget[key] ?? 0);
    if (target <= 0) return false;
    const off = Math.abs(target - totals[key]);
    return off > Math.max(10, target * 0.1);
  });
}

// The macro the day is furthest off on, measured in calories, and which way.
// Everything the search does is aimed at this one: a swap that fixes the carbs
// while leaving the day 300 kcal short has not helped.
function worstMacro(totals: Macros, budget: Macros): { key: MacroKey; short: boolean } | null {
  const ranked = MACRO_KEYS.map((key) => ({
    key,
    off: (budget[key] ?? 0) - totals[key],
  })).sort((a, b) => Math.abs(b.off) * KCAL_PER_G[b.key] - Math.abs(a.off) * KCAL_PER_G[a.key]);
  const top = ranked[0];
  if (!top || Math.abs(top.off) * KCAL_PER_G[top.key] < 60) return null;
  return { key: top.key, short: top.off > 0 };
}

// Find the single best pick-for-pantry-food trade, or null when the day already
// lands, when nothing in the pantry can be traded in, or when no trade helps
// enough to be worth asking about.
export function computeDaySwap(input: DaySwapInput): DaySwap | null {
  const slots = input.slots.filter((s) => s.foods.length > 0);
  if (slots.length === 0) return null;

  const solve = (trial: PickedSlotInput[]) =>
    sumMeals(planPickedDay({ slots: trial, budget: input.budget, weights: input.weights }));

  const before = solve(slots);
  if (!needsHelp(before, input.budget)) return null;
  const baseScore = dayMissScore(before, input.budget);
  const target = worstMacro(before, input.budget);
  // No macro is badly out, so the day is short (or over) on energy alone, and
  // the food carrying the most of it is what to trade.
  const aimKey: MacroKey = target?.key ?? "carbs_g";
  const aimShort = target?.short ?? before.kcal < Math.max(0, input.budget.kcal);

  // Foods already on the day's plate, so a swap never proposes a food the meal
  // already has.
  const inSlot = slots.map((s) => new Set(s.foods.map((f) => normName(f.name))));

  // Every trade worth solving: a picked macro source out, a pantry food of the
  // same role in. Ranked by how much of the macro that is out of line the
  // candidate could actually deliver from stock, so the search spends its
  // budget on the swaps that can close the gap.
  type Trial = { slotIdx: number; foodIdx: number; to: PantryFood; rank: number };
  const trials: Trial[] = [];
  slots.forEach((s, slotIdx) => {
    s.foods.forEach((food, foodIdx) => {
      // A hand-set amount is the user's own, and a vegetable is a filler, not
      // the thing standing between the day and its macros.
      if (food.pinned_g != null) return;
      if (isFillerFood(food)) return;
      const role = macroRole(food);
      if (!role) return;
      const out = deliverable(food, aimKey);
      const options = input.pantry
        .filter(
          (c) =>
            normName(c.name) !== normName(food.name) &&
            !inSlot[slotIdx].has(normName(c.name)) &&
            !isFillerFood(c) &&
            macroRole(c) === role &&
            c.kcal_100g > 0 &&
            floorPortion(c, c.available_g ?? Infinity) > 0,
        )
        .map((c) => ({ c, gain: deliverable(c, aimKey) - out }))
        // Only in the direction the day needs: more of the macro when it is
        // short, less when it is over.
        .filter((o) => (aimShort ? o.gain > 0 : o.gain < 0))
        .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain))
        .slice(0, CANDIDATES_PER_PICK);
      for (const o of options) {
        trials.push({ slotIdx, foodIdx, to: o.c, rank: Math.abs(o.gain) });
      }
    });
  });
  if (trials.length === 0) return null;
  trials.sort((a, b) => b.rank - a.rank);

  let best: { trial: Trial; totals: Macros; score: number } | null = null;
  for (const t of trials.slice(0, MAX_TRIALS)) {
    const swapped = slots.map((s, i) =>
      i === t.slotIdx
        ? {
            slot: s.slot,
            // The pantry row goes in as it stands, at whatever stock it has, and
            // never pinned: the whole point is to let the solve size it.
            foods: s.foods.map((f, j) => (j === t.foodIdx ? { ...t.to, pinned_g: null } : f)),
          }
        : s,
    );
    const totals = solve(swapped);
    const score = dayMissScore(totals, input.budget);
    if (!best || score < best.score) best = { trial: t, totals, score };
  }
  if (!best) return null;
  const { trial, totals: after, score } = best;

  // Worth asking about only if it closes a real part of the gap. Both tests
  // have to pass: a swap that halves an already tiny miss is noise, and one that
  // improves the score by moving a macro while leaving the calories where they
  // were has not fixed the day.
  const kcalGain =
    Math.abs(before.kcal - Math.max(0, input.budget.kcal)) -
    Math.abs(after.kcal - Math.max(0, input.budget.kcal));
  const clearedOver = MACRO_KEYS.some(
    (key) => before[key] > (input.budget[key] ?? 0) && after[key] <= (input.budget[key] ?? 0),
  );
  if (score > baseScore * (1 - MIN_GAIN)) return null;
  if (kcalGain < MIN_KCAL_GAIN && !clearedOver) return null;

  const from = slots[trial.slotIdx].foods[trial.foodIdx].name;
  const slot = slots[trial.slotIdx].slot;
  return {
    slot,
    from,
    to: trial.to.name,
    reason: `These picks come to ${describe(before, input.budget)}.`,
    summary: `Swapping ${from} in ${slot.toLowerCase()} for ${trial.to.name} from your pantry lands ${describe(after, input.budget)}. Make the swap?`,
    before,
    after,
  };
}
