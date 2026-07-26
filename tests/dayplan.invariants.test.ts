import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  floorPortion,
  isCountable,
  maxServingG,
  planPickedDay,
  type PantryFood,
} from "@/lib/mealplan";
import type { Macros, PlannedSlot } from "@/lib/types";

// The day planner's promises, checked over randomly generated days of REAL foods
// (label energy included, which never equals 4/4/9 exactly) against budgets
// shaped like the coach's. These are the properties the reported bugs broke:
// #26 stacked whole portions over a pick until it was dropped, #27 locked a
// staple to a fixed serving and starved the rest of the day, #28 dropped a sauce
// rather than serve fewer chips. Each was a different food; the property is the
// same, so it is stated here once rather than case by case.

const f = (
  name: string,
  kcal: number,
  p: number,
  c: number,
  fat: number,
  extra: Partial<PantryFood> = {},
): PantryFood => ({
  name,
  kcal_100g: kcal,
  protein_100g: p,
  carbs_100g: c,
  fat_100g: fat,
  ...extra,
});

const PROTEINS = [
  f("Chicken Breast", 106, 24, 0, 1.4),
  f("Tofu", 136, 14, 2, 8),
  f("Salmon Fillet", 208, 20, 0, 13),
  f("Vegemince", 130, 16, 5, 3, { unit_g: 100, unit_label: "portion" }),
  f("Vegan Chicken Pieces", 168, 17, 4, 9, { unit_g: 140, unit_label: "portion" }),
  f("Greek Yogurt", 59, 10, 3.6, 0.4),
  f("Whey Protein", 380, 75, 6, 6),
  f("Eggs", 143, 13, 0.7, 9.5, { unit_g: 55, unit_label: "egg" }),
];
const CARBS = [
  f("Basmati Rice", 349, 7.1, 78, 0.9, { unit_g: 200, unit_label: "medium" }),
  f("Pasta", 371, 13, 71, 1.5, { unit_g: 180, unit_label: "medium" }),
  f("Bagel", 264, 10, 49, 2, { unit_g: 85, unit_label: "bagel" }),
  f("Potatoes", 77, 2, 17, 0.1),
  f("Straight cut chips", 151, 2.7, 21.7, 4.9),
  f("Sourdough Bread", 259, 9, 48, 2, { unit_g: 45, unit_label: "slice" }),
];
const VEG = [
  f("Tenderstem Broccoli", 27, 3.5, 2.3, 0.4),
  f("Wild Rocket", 24, 4.3, 0.3, 0.6),
  f("Roasted Red Bell Pepper Strips", 27, 0.9, 6.3, 0.3),
  f("Brown Onions", 40, 1.1, 9.3, 0.1),
  f("Courgettes", 17, 1.2, 3.1, 0.3),
];
const EXTRAS = [
  f("Olive Oil", 900, 0, 0, 100),
  f("Plant Butter Spreadable", 531, 0, 0, 59),
  f("Peanut Butter", 588, 25, 20, 50),
  f("Barbecue Sauce", 172, 1, 40, 0.5),
  f("Banana", 89, 1.1, 23, 0.3, { unit_g: 120, unit_label: "banana" }),
  f("Hummus", 166, 7.6, 14, 9.6),
];

const someOf = (pool: PantryFood[], idx: number[]) =>
  [...new Set(idx.map((i) => pool[i % pool.length]))].map((x) => ({ ...x }));

// A day a real user could pick: two to four meals, each with a protein, a carb,
// some veg and sometimes a fat or a sauce.
const pickedDay = fc
  .record({
    meals: fc.array(
      fc.record({
        protein: fc.nat(),
        carb: fc.nat(),
        veg: fc.array(fc.nat(), { maxLength: 3 }),
        extra: fc.array(fc.nat(), { maxLength: 2 }),
      }),
      { minLength: 2, maxLength: 4 },
    ),
    kcal: fc.integer({ min: 1400, max: 2600 }),
    protein_g: fc.integer({ min: 90, max: 180 }),
    fatShare: fc.integer({ min: 20, max: 35 }),
  })
  .map(({ meals, kcal, protein_g, fatShare }) => {
    const fat_g = Math.round((kcal * (fatShare / 100)) / 9);
    const carbs_g = Math.max(20, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
    // A coach target is internally consistent: its kcal IS its macros.
    const budget: Macros = {
      kcal: protein_g * 4 + carbs_g * 4 + fat_g * 9,
      protein_g,
      carbs_g,
      fat_g,
    };
    return {
      slots: meals.map((m, i) => ({
        slot: `Meal ${i}`,
        foods: [
          { ...PROTEINS[m.protein % PROTEINS.length] },
          { ...CARBS[m.carb % CARBS.length] },
          ...someOf(VEG, m.veg),
          ...someOf(EXTRAS, m.extra),
        ],
      })),
      budget,
    };
  });

const sumPlan = (plan: PlannedSlot[]) =>
  plan.reduce(
    (s, m) => ({
      kcal: s.kcal + m.kcal,
      protein_g: s.protein_g + m.protein_g,
      carbs_g: s.carbs_g + m.carbs_g,
      fat_g: s.fat_g + m.fat_g,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

const saysOffTarget = (plan: PlannedSlot[]) =>
  plan.some((m) => /today's target|protein lands/i.test(m.why ?? ""));

describe("the day plan, over random realistic days", () => {
  it("serves every food the user picked", () => {
    fc.assert(
      fc.property(pickedDay, ({ slots, budget }) => {
        const plan = planPickedDay({ slots, budget });
        for (const s of slots) {
          const meal = plan.find((m) => m.slot === s.slot);
          expect(meal, `${s.slot} missing entirely`).toBeDefined();
          for (const food of s.foods) {
            expect(
              meal!.portions.find((p) => p.name === food.name),
              `${food.name} dropped from ${s.slot}`,
            ).toBeDefined();
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("serves every portion in an amount someone would eat", () => {
    fc.assert(
      fc.property(pickedDay, ({ slots, budget }) => {
        const plan = planPickedDay({ slots, budget });
        for (const s of slots) {
          const meal = plan.find((m) => m.slot === s.slot)!;
          for (const food of s.foods) {
            const p = meal.portions.find((x) => x.name === food.name)!;
            expect(p.grams).toBeGreaterThanOrEqual(floorPortion(food, Infinity));
            expect(p.grams).toBeLessThanOrEqual(maxServingG(food));
            if (isCountable(food)) expect(p.grams % food.unit_g!).toBe(0);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("lands the day's energy on target, or says how far off it is", () => {
    fc.assert(
      fc.property(pickedDay, ({ slots, budget }) => {
        const plan = planPickedDay({ slots, budget });
        const tot = sumPlan(plan);
        if (Math.abs(tot.kcal - budget.kcal) > 50) {
          expect(
            saysOffTarget(plan),
            `${tot.kcal} kcal against a ${budget.kcal} budget, reported as fine`,
          ).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("keeps protein close, or names the shortfall", () => {
    fc.assert(
      fc.property(pickedDay, ({ slots, budget }) => {
        const plan = planPickedDay({ slots, budget });
        if (saysOffTarget(plan)) return;
        const tot = sumPlan(plan);
        expect(Math.abs(tot.protein_g - budget.protein_g)).toBeLessThanOrEqual(
          Math.max(10, budget.protein_g * 0.1),
        );
      }),
      { numRuns: 300 },
    );
  });

  it("shows meal totals that equal the portions listed under them", () => {
    fc.assert(
      fc.property(pickedDay, ({ slots, budget }) => {
        for (const meal of planPickedDay({ slots, budget })) {
          const summed = meal.portions.reduce(
            (s, p) => ({
              kcal: s.kcal + (p.kcal ?? 0),
              protein_g: s.protein_g + (p.protein_g ?? 0),
              carbs_g: s.carbs_g + (p.carbs_g ?? 0),
              fat_g: s.fat_g + (p.fat_g ?? 0),
            }),
            { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
          );
          expect(summed).toEqual({
            kcal: meal.kcal,
            protein_g: meal.protein_g,
            carbs_g: meal.carbs_g,
            fat_g: meal.fat_g,
          });
        }
      }),
      { numRuns: 200 },
    );
  });

  it("plans the same day the same way twice", () => {
    fc.assert(
      fc.property(pickedDay, ({ slots, budget }) => {
        const a = planPickedDay({ slots, budget });
        const b = planPickedDay({ slots, budget });
        expect(a).toEqual(b);
      }),
      { numRuns: 100 },
    );
  });

  it("never portions past the pack, across the whole day", () => {
    fc.assert(
      fc.property(pickedDay, fc.integer({ min: 30, max: 400 }), ({ slots, budget }, stock) => {
        const stocked = slots.map((s) => ({
          slot: s.slot,
          foods: s.foods.map((food) => ({ ...food, available_g: stock })),
        }));
        const plan = planPickedDay({ slots: stocked, budget });
        const byName = new Map<string, number>();
        for (const meal of plan) {
          for (const p of meal.portions) {
            byName.set(p.name, (byName.get(p.name) ?? 0) + p.grams);
          }
        }
        for (const [, grams] of byName) expect(grams).toBeLessThanOrEqual(stock);
      }),
      { numRuns: 200 },
    );
  });
});
