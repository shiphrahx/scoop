import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { macroRole } from "@/lib/foodgroups";
import { planPantryDay, type PantryFood } from "@/lib/mealplan";
import type { Macros, PlannedSlot } from "@/lib/types";

// The planner's promise (mealplan.ts, top of file): the day's totals land within
// ±5 of every macro target. The example tests prove that for one tidy pantry of
// three foods. These prove it for pantries the planner has never seen — which is
// where a real user's pantry lives — and pin down where the promise stops
// holding, so a future change can't quietly widen the gap.

const SLOTS = ["Breakfast", "Lunch", "Snack", "Dinner"];
const TOLERANCE = 5;

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

// kcal derived from the macros, so every generated food is physically coherent
// (nothing has 5 g of protein and 900 kcal).
const kcalOf = (p: number, c: number, f: number) => p * 4 + c * 4 + f * 9;

const food = (
  name: string,
  protein_100g: number,
  carbs_100g: number,
  fat_100g: number,
): PantryFood => ({
  name,
  protein_100g,
  carbs_100g,
  fat_100g,
  kcal_100g: kcalOf(protein_100g, carbs_100g, fat_100g),
});

// One source per macro, each dominated by its own macro (that's what puts it in
// the pool) but carrying incidental amounts of the others, like real food does.
const pantryOf = fc
  .record({
    p: fc.record({
      protein: fc.integer({ min: 12, max: 35 }),
      carbs: fc.integer({ min: 0, max: 6 }),
      fat: fc.integer({ min: 0, max: 12 }),
    }),
    c: fc.record({
      protein: fc.integer({ min: 0, max: 9 }),
      carbs: fc.integer({ min: 18, max: 75 }),
      fat: fc.integer({ min: 0, max: 6 }),
    }),
    f: fc.record({
      protein: fc.integer({ min: 0, max: 6 }),
      carbs: fc.integer({ min: 0, max: 6 }),
      fat: fc.integer({ min: 30, max: 100 }),
    }),
  })
  .map(({ p, c, f }) => ({
    protein: food("Protein source", p.protein, p.carbs, p.fat),
    carb: food("Carb source", c.protein, c.carbs, c.fat),
    fat: food("Fat source", f.protein, f.carbs, f.fat),
  }))
  // Keep only pantries that give the planner one source per macro AS THE APP
  // CLASSIFIES THEM. A generated "carb" with 7 g of protein is a protein source
  // by macroRole (so is a lentil), which would leave the pantry with no carb at
  // all — an unreachable target, and not the solver's fault.
  .filter(
    (x) =>
      macroRole(x.protein) === "protein" &&
      macroRole(x.carb) === "carb" &&
      macroRole(x.fat) === "fat",
  );

const zero: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

// A day target built by actually weighing out portions of THIS pantry. That
// makes the target reachable by construction — a solution exists, inside the
// portion caps and with no negative grams — so any miss is the solver's fault,
// not the pantry's. This is the contract the planner sells.
const reachableDay = pantryOf.chain((pantry) =>
  fc
    .record({
      slots: fc.integer({ min: 1, max: 4 }),
      gramsProtein: fc.integer({ min: 40, max: 120 }),
      gramsCarb: fc.integer({ min: 40, max: 140 }),
      gramsFat: fc.integer({ min: 3, max: 30 }),
    })
    .map(({ slots, gramsProtein, gramsCarb, gramsFat }) => {
      // Per-slot grams × slots = the day's grams, so every per-slot share is
      // reachable too and nothing has to exceed a cap.
      const per = (f: PantryFood, g: number) => ({
        protein_g: (f.protein_100g * g) / 100,
        carbs_g: (f.carbs_100g * g) / 100,
        fat_g: (f.fat_100g * g) / 100,
        kcal: (f.kcal_100g * g) / 100,
      });
      const parts = [
        per(pantry.protein, gramsProtein),
        per(pantry.carb, gramsCarb),
        per(pantry.fat, gramsFat),
      ];
      const budget: Macros = {
        protein_g: Math.round(parts.reduce((s, x) => s + x.protein_g, 0) * slots),
        carbs_g: Math.round(parts.reduce((s, x) => s + x.carbs_g, 0) * slots),
        fat_g: Math.round(parts.reduce((s, x) => s + x.fat_g, 0) * slots),
        kcal: Math.round(parts.reduce((s, x) => s + x.kcal, 0) * slots),
      };
      return {
        pantry: [pantry.protein, pantry.carb, pantry.fat],
        budget,
        slots,
      };
    }),
);

describe("planPantryDay invariants", () => {
  it("lands the day within ±5 of every macro when the target is reachable", () => {
    fc.assert(
      fc.property(reachableDay, ({ pantry, budget, slots }) => {
        const plan = planPantryDay({
          pantry,
          budget,
          fixed: zero,
          emptySlots: SLOTS.slice(0, slots),
        });
        const tot = sumPlan(plan);
        expect(Math.abs(tot.protein_g - budget.protein_g)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(tot.carbs_g - budget.carbs_g)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(tot.fat_g - budget.fat_g)).toBeLessThanOrEqual(TOLERANCE);
      }),
    );
  });

  it("still lands the day when meals the user planned take part of the budget", () => {
    fc.assert(
      fc.property(reachableDay, ({ pantry, budget }) => {
        // A third of the day is already spoken for by a meal the user built.
        const fixed: Macros = {
          kcal: Math.round(budget.kcal / 3),
          protein_g: Math.round(budget.protein_g / 3),
          carbs_g: Math.round(budget.carbs_g / 3),
          fat_g: Math.round(budget.fat_g / 3),
        };
        const plan = planPantryDay({
          pantry,
          budget,
          fixed,
          emptySlots: SLOTS.slice(0, 2),
        });
        const tot = sumPlan(plan);
        // Planned + already-fixed should still add up to the day, not blow it.
        expect(
          Math.abs(tot.protein_g + fixed.protein_g - budget.protein_g),
        ).toBeLessThanOrEqual(TOLERANCE);
        expect(
          Math.abs(tot.carbs_g + fixed.carbs_g - budget.carbs_g),
        ).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(tot.fat_g + fixed.fat_g - budget.fat_g)).toBeLessThanOrEqual(
          TOLERANCE,
        );
      }),
    );
  });

  it("never plans a portion the user does not have in stock", () => {
    fc.assert(
      fc.property(
        reachableDay,
        fc.integer({ min: 20, max: 400 }),
        ({ pantry, budget }, stockG) => {
          // Every item capped at the same small stock, so the cap really bites.
          const stocked = pantry.map((f) => ({ ...f, available_g: stockG }));
          const plan = planPantryDay({
            pantry: stocked,
            budget,
            fixed: zero,
            emptySlots: SLOTS,
          });
          for (const meal of plan) {
            for (const p of meal.portions) {
              expect(p.grams).toBeLessThanOrEqual(stockG);
            }
          }
        },
      ),
    );
  });

  it("never plans a negative, infinite or absurd portion", () => {
    fc.assert(
      fc.property(reachableDay, ({ pantry, budget }) => {
        const plan = planPantryDay({
          pantry,
          budget,
          fixed: zero,
          emptySlots: SLOTS,
        });
        for (const meal of plan) {
          for (const p of meal.portions) {
            expect(Number.isFinite(p.grams)).toBe(true);
            expect(p.grams).toBeGreaterThan(0);
            expect(p.grams).toBeLessThanOrEqual(600); // the widest per-macro ceiling
          }
        }
      }),
    );
  });

  it("always shows a meal total equal to the portions listed under it", () => {
    fc.assert(
      fc.property(reachableDay, ({ pantry, budget }) => {
        const plan = planPantryDay({
          pantry,
          budget,
          fixed: zero,
          emptySlots: SLOTS,
        });
        for (const meal of plan) {
          const summed = meal.portions.reduce(
            (s, p) => ({
              kcal: s.kcal + (p.kcal ?? 0),
              protein_g: s.protein_g + (p.protein_g ?? 0),
              carbs_g: s.carbs_g + (p.carbs_g ?? 0),
              fat_g: s.fat_g + (p.fat_g ?? 0),
            }),
            { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
          );
          expect(summed.kcal).toBe(meal.kcal);
          expect(summed.protein_g).toBe(meal.protein_g);
          expect(summed.carbs_g).toBe(meal.carbs_g);
          expect(summed.fat_g).toBe(meal.fat_g);
        }
      }),
    );
  });
});

// Where the ±5 promise genuinely cannot hold. These aren't bugs to fix in the
// solver — no arrangement of these foods hits the target — but the plan must
// still be safe and the miss must be visible to the user, which is what the
// nutrient-fit verdict on the day page is for.
describe("planPantryDay when the target is unreachable", () => {
  it("under-delivers rather than prescribing an absurd portion", () => {
    // A weak protein source: 80 g of protein would need 533 g of it, past the
    // 500 g portion ceiling. The planner must not serve half a kilo and a bit
    // more — it caps the portion and comes up short.
    const weakProtein = food("Watery Tofu", 15, 0, 0);
    const plan = planPantryDay({
      pantry: [weakProtein, food("Rice", 0, 20, 0), food("Oil", 0, 0, 100)],
      budget: { kcal: 1094, protein_g: 80, carbs_g: 126, fat_g: 30 },
      fixed: zero,
      emptySlots: ["Dinner"],
    });
    const tot = sumPlan(plan);
    expect(tot.protein_g).toBeLessThan(80); // came up short, as it must
    for (const meal of plan) {
      for (const p of meal.portions) {
        expect(p.grams).toBeLessThanOrEqual(600);
      }
    }
  });

  it("cannot go below the fat its carb source brings with it", () => {
    // The only carb source carries 3 g fat per 100 g. Hitting 140 g of carbs
    // from it drags in 21 g of fat on its own — over a 15 g fat budget. There is
    // no portion of these foods that satisfies both, so the fat target is missed
    // and the day page's verdict is what tells the user.
    const fattyCarb = food("Fried Rice", 0, 20, 3);
    const plan = planPantryDay({
      pantry: [food("Chicken", 15, 0, 0), fattyCarb, food("Oil", 0, 0, 30)],
      budget: { kcal: 1000, protein_g: 40, carbs_g: 140, fat_g: 15 },
      fixed: zero,
      emptySlots: ["Dinner"],
    });
    const tot = sumPlan(plan);
    expect(tot.carbs_g).toBeGreaterThan(100); // it does chase the carb target
    expect(tot.fat_g).toBeGreaterThan(15); // and overshoots fat doing so
  });
});
