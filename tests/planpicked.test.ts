import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { macroRole } from "@/lib/foodgroups";
import { planPickedDay, type PantryFood } from "@/lib/mealplan";
import type { PlannedSlot } from "@/lib/types";

// The per-meal planner's promise: the user names the foods for each meal, the
// solve portions ALL the meals together, and the day's totals land on the
// budget (within ±5 of each macro) whenever the picks can reach it. Meal sizes
// follow the slot weights, softly — they bend before the day total does.

const TOLERANCE = 5;

const kcalOf = (p: number, c: number, f: number) => p * 4 + c * 4 + f * 9;

const food = (
  name: string,
  protein_100g: number,
  carbs_100g: number,
  fat_100g: number,
  available_g?: number,
): PantryFood => ({
  name,
  protein_100g,
  carbs_100g,
  fat_100g,
  kcal_100g: kcalOf(protein_100g, carbs_100g, fat_100g),
  available_g,
});

// Realistic staples for the example tests.
const pasta = () => food("Pasta", 13, 71, 1.5);
const mince = () => food("Vegan Mince", 20, 5, 5);
const oil = () => food("Olive Oil", 0, 0, 100);
const bagel = () => food("Bagel", 10, 49, 2);
const tofu = () => food("Tofu", 14, 2, 8);
const chicken = () => food("Chicken Breast", 31, 0, 3.6);

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

// A budget reachable by construction: weigh out real grams of the picked foods
// and use the sum as the day's budget, so a solution certainly exists.
function budgetOf(parts: { food: PantryFood; grams: number }[]) {
  return {
    kcal: Math.round(parts.reduce((s, p) => s + (p.food.kcal_100g * p.grams) / 100, 0)),
    protein_g: Math.round(
      parts.reduce((s, p) => s + (p.food.protein_100g * p.grams) / 100, 0),
    ),
    carbs_g: Math.round(
      parts.reduce((s, p) => s + (p.food.carbs_100g * p.grams) / 100, 0),
    ),
    fat_g: Math.round(parts.reduce((s, p) => s + (p.food.fat_100g * p.grams) / 100, 0)),
  };
}

describe("planPickedDay", () => {
  it("only ever portions a countable food in whole units", () => {
    // A bagel counted at 85 g each and a portioned vegan-chicken pack (140 g a
    // portion). Whatever the budget, neither may come out as a part of a unit.
    const bagelUnit: PantryFood = { ...bagel(), unit_g: 85, unit_label: "bagel" };
    const chicken: PantryFood = {
      ...food("Vegan Chicken", 18, 3, 6),
      unit_g: 140,
      unit_label: "portion",
    };

    fc.assert(
      fc.property(
        fc.integer({ min: 600, max: 2600 }),
        fc.integer({ min: 40, max: 220 }),
        fc.integer({ min: 30, max: 120 }),
        (kcal, protein_g, fat_g) => {
          const plan = planPickedDay({
            slots: [
              { slot: "Breakfast", foods: [bagelUnit] },
              { slot: "Dinner", foods: [chicken, oil()] },
            ],
            budget: { kcal, protein_g, carbs_g: 200, fat_g },
          });
          for (const meal of plan) {
            for (const p of meal.portions) {
              const unit = p.name === "Bagel" ? 85 : p.name === "Vegan Chicken" ? 140 : 0;
              if (unit) expect(p.grams % unit).toBe(0);
            }
          }
        },
      ),
    );
  });

  it("lands the day on target with different picks per meal", () => {
    // Lunch: pasta + vegan mince + a little oil. Dinner: bagel + tofu. The
    // budget is what those foods at sensible grams actually add up to.
    const lunch = [pasta(), mince(), oil()];
    const dinner = [bagel(), tofu()];
    const budget = budgetOf([
      { food: lunch[0], grams: 100 },
      { food: lunch[1], grams: 150 },
      { food: lunch[2], grams: 5 },
      { food: dinner[0], grams: 85 },
      { food: dinner[1], grams: 200 },
    ]);

    const plan = planPickedDay({
      slots: [
        { slot: "Lunch", foods: lunch },
        { slot: "Dinner", foods: dinner },
      ],
      budget,
    });

    expect(plan.map((m) => m.slot)).toEqual(["Lunch", "Dinner"]);
    const tot = sumPlan(plan);
    expect(Math.abs(tot.protein_g - budget.protein_g)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(tot.carbs_g - budget.carbs_g)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(tot.fat_g - budget.fat_g)).toBeLessThanOrEqual(TOLERANCE);
  });

  it("uses every picked food when the budget has room for it", () => {
    const plan = planPickedDay({
      slots: [
        { slot: "Lunch", foods: [pasta(), mince(), oil()] },
        { slot: "Dinner", foods: [bagel(), tofu()] },
      ],
      budget: { kcal: 1800, protein_g: 110, carbs_g: 180, fat_g: 55 },
    });
    const names = plan.flatMap((m) => m.portions.map((p) => p.name));
    expect(names).toContain("Pasta");
    expect(names).toContain("Vegan Mince");
    expect(names).toContain("Bagel");
    expect(names).toContain("Tofu");
  });

  it("spreads protein across meals instead of piling it on the fattiest pick", () => {
    // Regression: lean vegan picks, one protein per meal, and a day whose fat
    // target the picks can't cleanly reach. The solver must NOT dump the day's
    // protein onto the single fattiest food (the vegan chicken) just to chase
    // fat — each meal's own protein source should carry a real share.
    const bagelUnit: PantryFood = { ...bagel(), unit_g: 85, unit_label: "bagel" };
    const freeMince = food("Vegan Mince", 17, 5, 3);
    const banana = food("Banana", 1.1, 23, 0.3);
    const almond = food("Almond Drink", 0.4, 0.1, 1.1);
    const powder = food("Vegan Protein Powder", 70, 5, 6);
    const rigatoni = food("Rigatoni", 12, 70, 1.5);
    const vChicken = food("Vegan Chicken", 17, 4, 9);

    const plan = planPickedDay({
      slots: [
        { slot: "Lunch", foods: [bagelUnit, freeMince] },
        { slot: "Snack", foods: [banana, almond, powder] },
        { slot: "Dinner", foods: [rigatoni, vChicken] },
      ],
      budget: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 },
    });

    const gramsOf = (name: string) =>
      plan.flatMap((m) => m.portions).find((p) => p.name === name)?.grams ?? 0;

    // Every protein source is actually used, not squeezed to nothing.
    expect(gramsOf("Vegan Mince")).toBeGreaterThan(50);
    expect(gramsOf("Vegan Protein Powder")).toBeGreaterThan(20);
    expect(gramsOf("Vegan Chicken")).toBeGreaterThan(50);
    // No protein source balloons to an unrealistic amount chasing the fat target
    // (before the fix the vegan chicken ran to 500 g — half a kilo — to hit fat).
    for (const name of ["Vegan Mince", "Vegan Protein Powder", "Vegan Chicken"]) {
      expect(gramsOf(name)).toBeLessThanOrEqual(350);
    }
    // Protein isn't dumped into one meal: the heaviest-protein meal stays under
    // 60% of the day (with even weights, three protein meals should be ~a third
    // each, not one meal carrying it all).
    const dayProtein = plan.reduce((s, m) => s + m.protein_g, 0);
    const maxMealProtein = Math.max(...plan.map((m) => m.protein_g));
    expect(maxMealProtein).toBeLessThan(dayProtein * 0.6);
  });

  it("re-balances the other meals when a countable pick rounds to a whole unit", () => {
    // Regression: dinner's protein is a countable pack that snaps up to 2 whole
    // portions. Lunch and the snack must still get their protein and the DAY
    // must stay on target — the rounding is absorbed by the weighable foods, not
    // dumped on one meal while another goes without.
    const freeMince = food("Vegan Mince", 17, 5, 3);
    const powder = food("Vegan Protein Powder", 70, 5, 6);
    const banana = food("Banana", 1.1, 23, 0.3);
    const rigatoni = food("Rigatoni", 12, 70, 1.5);
    const vChicken: PantryFood = {
      ...food("Vegan Chicken", 17, 4, 9),
      unit_g: 150,
      unit_label: "portion",
    };

    const plan = planPickedDay({
      slots: [
        { slot: "Lunch", foods: [freeMince] },
        { slot: "Snack", foods: [banana, powder] },
        { slot: "Dinner", foods: [rigatoni, vChicken] },
      ],
      budget: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 },
    });

    // No meal is left without protein.
    for (const m of plan) expect(m.protein_g).toBeGreaterThan(15);
    // The countable chicken is still a whole number of portions.
    const chick = plan.flatMap((m) => m.portions).find((p) => p.name === "Vegan Chicken")!;
    expect(chick.grams % 150).toBe(0);
    // And the day still lands on its protein target despite that rounding.
    const dayProtein = plan.reduce((s, m) => s + m.protein_g, 0);
    expect(Math.abs(dayProtein - 150)).toBeLessThanOrEqual(TOLERANCE);
  });

  it("sizes meals by the slot weights", () => {
    // Same picks in both meals so size differences come only from the weights.
    const budget = { kcal: 1600, protein_g: 120, carbs_g: 150, fat_g: 50 };
    const plan = planPickedDay({
      slots: [
        { slot: "Lunch", foods: [chicken(), pasta(), oil()] },
        { slot: "Dinner", foods: [chicken(), pasta(), oil()] },
      ],
      budget,
      weights: { Lunch: 25, Dinner: 75 },
    });
    const lunch = plan.find((m) => m.slot === "Lunch")!;
    const dinner = plan.find((m) => m.slot === "Dinner")!;
    // Dinner should be about three times lunch. Allow slack for rounding.
    expect(dinner.kcal).toBeGreaterThan(lunch.kcal * 2);
  });

  it("splits evenly when no weights are given", () => {
    const budget = { kcal: 1600, protein_g: 120, carbs_g: 150, fat_g: 50 };
    const plan = planPickedDay({
      slots: [
        { slot: "Lunch", foods: [chicken(), pasta(), oil()] },
        { slot: "Dinner", foods: [chicken(), pasta(), oil()] },
      ],
      budget,
    });
    const [a, b] = plan;
    expect(Math.abs(a.kcal - b.kcal)).toBeLessThanOrEqual(budget.kcal * 0.05);
  });

  it("gives a single picked meal the whole budget", () => {
    const budget = { kcal: 900, protein_g: 60, carbs_g: 90, fat_g: 30 };
    const plan = planPickedDay({
      slots: [{ slot: "Dinner", foods: [chicken(), pasta(), oil()] }],
      budget,
    });
    expect(plan).toHaveLength(1);
    expect(Math.abs(plan[0].protein_g - 60)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(plan[0].carbs_g - 90)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(plan[0].fat_g - 30)).toBeLessThanOrEqual(TOLERANCE);
  });

  it("shrinks a pick that barely fits and says so", () => {
    // Almost no carbs in the budget, but the user insists on pasta for dinner.
    const plan = planPickedDay({
      slots: [
        { slot: "Lunch", foods: [chicken()] },
        { slot: "Dinner", foods: [pasta()] },
      ],
      budget: { kcal: 280, protein_g: 60, carbs_g: 5, fat_g: 8 },
    });
    const dinner = plan.find((m) => m.slot === "Dinner");
    expect(dinner).toBeDefined();
    expect(dinner!.portions[0].grams).toBeLessThan(10);
    expect(dinner!.why).toMatch(/came out small/i);
  });

  it("drops a pick there is no room for at all", () => {
    // Zero carbs left: pasta cannot appear even tiny, so dinner falls out of
    // the result entirely (the caller explains on the slot).
    const plan = planPickedDay({
      slots: [
        { slot: "Lunch", foods: [chicken()] },
        { slot: "Dinner", foods: [pasta()] },
      ],
      budget: { kcal: 248, protein_g: 62, carbs_g: 0, fat_g: 7 },
    });
    expect(plan.find((m) => m.slot === "Lunch")).toBeDefined();
    expect(plan.find((m) => m.slot === "Dinner")).toBeUndefined();
  });

  it("never portions more of a food than the stock across the whole day", () => {
    // 150 g of tofu in stock, picked for BOTH meals: together they must not
    // exceed the pack.
    const plan = planPickedDay({
      slots: [
        { slot: "Lunch", foods: [food("Tofu", 14, 2, 8, 150), pasta()] },
        { slot: "Dinner", foods: [food("Tofu", 14, 2, 8, 150), bagel()] },
      ],
      budget: { kcal: 1800, protein_g: 120, carbs_g: 180, fat_g: 55 },
    });
    const tofuTotal = plan
      .flatMap((m) => m.portions)
      .filter((p) => p.name === "Tofu")
      .reduce((s, p) => s + p.grams, 0);
    expect(tofuTotal).toBeLessThanOrEqual(150);
  });

  it("returns nothing for no picks", () => {
    expect(
      planPickedDay({
        slots: [],
        budget: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 },
      }),
    ).toEqual([]);
    expect(
      planPickedDay({
        slots: [{ slot: "Lunch", foods: [] }],
        budget: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 },
      }),
    ).toEqual([]);
  });

  it("shows a meal total equal to the portions listed under it", () => {
    const plan = planPickedDay({
      slots: [
        { slot: "Lunch", foods: [pasta(), mince(), oil()] },
        { slot: "Dinner", foods: [bagel(), tofu()] },
      ],
      budget: { kcal: 1800, protein_g: 110, carbs_g: 180, fat_g: 55 },
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
  });
});

// ---------------------------------------------------------------------------
// Vegetables are fillers, not a macro source. The user picks veg for several
// meals; each should get a sensible serving in each meal it was picked into, and
// the solver must never grow a vegetable to compensate for a missing carb.
// ---------------------------------------------------------------------------

// Realistic per-100g veg, edible portion (from the fresh-food seed).
const onion = () => food("Brown Onions", 1.1, 9.3, 0.1);
const courgette = () => food("Courgettes", 1.2, 3.1, 0.3);
const broccoli = () => food("Tenderstem Broccoli", 2.8, 7, 0.4);
const rice = () => food("Basmati Rice", 7.1, 78, 0.9);

const gramsOf = (plan: PlannedSlot[], name: string) =>
  plan.flatMap((m) => m.portions).find((p) => p.name === name)?.grams ?? 0;
const gramsIn = (plan: PlannedSlot[], slot: string, name: string) =>
  plan.find((m) => m.slot === slot)?.portions.find((p) => p.name === name)?.grams ?? 0;

describe("planPickedDay — vegetables as fillers", () => {
  // The exact reported bug: veg picked for BOTH lunch and dinner, rice only in
  // lunch. Before the fix all veg landed in dinner (400 g onion to hit dinner's
  // carbs) and lunch's veg were dropped as "couldn't fit".
  const reportedPlan = () =>
    planPickedDay({
      slots: [
        { slot: "Lunch", foods: [tofu(), rice(), onion(), courgette(), broccoli()] },
        { slot: "Snack", foods: [food("Vegan Protein", 70, 5, 6), food("Banana", 1.1, 23, 0.3)] },
        { slot: "Dinner", foods: [mince(), courgette(), onion(), broccoli()] },
      ],
      budget: { kcal: 1800, protein_g: 130, carbs_g: 170, fat_g: 50 },
    });

  it("puts the veg the user picked in lunch INTO lunch, not all in dinner", () => {
    const plan = reportedPlan();
    // Lunch keeps its onion, courgette and broccoli — none dropped.
    expect(gramsIn(plan, "Lunch", "Brown Onions")).toBeGreaterThan(0);
    expect(gramsIn(plan, "Lunch", "Courgettes")).toBeGreaterThan(0);
    expect(gramsIn(plan, "Lunch", "Tenderstem Broccoli")).toBeGreaterThan(0);
    // Dinner keeps its veg too.
    expect(gramsIn(plan, "Dinner", "Brown Onions")).toBeGreaterThan(0);
    expect(gramsIn(plan, "Dinner", "Courgettes")).toBeGreaterThan(0);
  });

  it("never serves an absurd pile of a vegetable to chase carbs", () => {
    const plan = reportedPlan();
    // No single veg portion runs past ~one standard serving (was 400 g of onion).
    for (const veg of ["Brown Onions", "Courgettes", "Tenderstem Broccoli"]) {
      for (const m of plan) {
        const g = m.portions.find((p) => p.name === veg)?.grams ?? 0;
        expect(g).toBeLessThanOrEqual(100);
      }
    }
  });

  it("gives each picked veg the same serving in each meal (balanced)", () => {
    const plan = reportedPlan();
    // Onion is picked in both lunch and dinner: the two servings match.
    expect(gramsIn(plan, "Lunch", "Brown Onions")).toBe(gramsIn(plan, "Dinner", "Brown Onions"));
    expect(gramsIn(plan, "Lunch", "Courgettes")).toBe(gramsIn(plan, "Dinner", "Courgettes"));
  });

  it("fills the day's carbs from the real carb source, not the veg", () => {
    const plan = reportedPlan();
    // Rice carries far more of the day's carbs than all the veg together.
    const riceCarbs = (rice().carbs_100g * gramsOf(plan, "Basmati Rice")) / 100;
    const vegCarbs = ["Brown Onions", "Courgettes", "Tenderstem Broccoli"].reduce((s, name) => {
      const per100 = name === "Brown Onions" ? 9.3 : name === "Courgettes" ? 3.1 : 7;
      const grams = plan
        .flatMap((m) => m.portions)
        .filter((p) => p.name === name)
        .reduce((a, p) => a + p.grams, 0);
      return s + (per100 * grams) / 100;
    }, 0);
    expect(riceCarbs).toBeGreaterThan(vegCarbs);
  });

  it("caps a veg serving at its stock", () => {
    // Only 30 g of onion in the pack: the serving can't exceed it.
    const plan = planPickedDay({
      slots: [
        { slot: "Lunch", foods: [rice(), tofu(), food("Brown Onions", 1.1, 9.3, 0.1, 30)] },
      ],
      budget: { kcal: 700, protein_g: 45, carbs_g: 90, fat_g: 20 },
    });
    expect(gramsOf(plan, "Brown Onions")).toBeLessThanOrEqual(30);
    expect(gramsOf(plan, "Brown Onions")).toBeGreaterThan(0);
  });

  it("still hits the day's macros with veg in the mix", () => {
    const plan = reportedPlan();
    const tot = sumPlan(plan);
    // Protein and carbs are what the sources are solved to hit; both land close.
    expect(Math.abs(tot.protein_g - 130)).toBeLessThanOrEqual(15);
    expect(Math.abs(tot.carbs_g - 170)).toBeLessThanOrEqual(20);
  });

  it("plans a meal of only vegetables without a macro source", () => {
    const plan = planPickedDay({
      slots: [
        { slot: "Lunch", foods: [rice(), chicken()] },
        { slot: "Side", foods: [broccoli(), courgette()] },
      ],
      budget: { kcal: 900, protein_g: 80, carbs_g: 90, fat_g: 20 },
    });
    const side = plan.find((m) => m.slot === "Side");
    expect(side).toBeDefined();
    expect(side!.portions.map((p) => p.name).sort()).toEqual(["Courgettes", "Tenderstem Broccoli"]);
  });

  it("keeps a pea/soy protein product a source, not a filler", () => {
    // "Pea Protein" reads as a vegetable (pea) AND a protein — it must stay a
    // solved protein source, not be pinned to an 80 g filler serving.
    const plan = planPickedDay({
      slots: [{ slot: "Lunch", foods: [food("Pea Protein Powder", 80, 5, 6), rice()] }],
      budget: { kcal: 700, protein_g: 90, carbs_g: 80, fat_g: 12 },
    });
    // A protein source solved to hit 90 g protein needs well over an 80 g serving.
    expect(gramsOf(plan, "Pea Protein Powder")).toBeGreaterThan(90);
  });
});

// ---------------------------------------------------------------------------
// Property tests: the ±5 promise for picks the solver has never seen.
// ---------------------------------------------------------------------------

// One meal's picks: a protein, a carb and a fat source with incidental amounts
// of the other macros, like real food. Filtered so the app classifies each as
// the role we meant (mirrors mealplan.invariants.test.ts).
const mealFoodsOf = (tag: string) =>
  fc
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
    .map(({ p, c, f }) => [
      food(`Protein ${tag}`, p.protein, p.carbs, p.fat),
      food(`Carb ${tag}`, c.protein, c.carbs, c.fat),
      food(`Fat ${tag}`, f.protein, f.carbs, f.fat),
    ])
    .filter(
      ([p, c, f]) =>
        macroRole(p) === "protein" && macroRole(c) === "carb" && macroRole(f) === "fat",
    );

// A whole picked day: 1–3 meals, each with its own three foods, and a budget
// built by weighing out real portions of exactly those foods — reachable by
// construction, so a miss is the solver's fault.
const reachablePickedDay = fc
  .integer({ min: 1, max: 3 })
  .chain((n) =>
    fc
      .tuple(
        fc.tuple(
          ...Array.from({ length: n }, (_, i) => mealFoodsOf(String(i))),
        ),
        fc.tuple(
          ...Array.from({ length: n }, () =>
            fc.record({
              gp: fc.integer({ min: 40, max: 120 }),
              gc: fc.integer({ min: 40, max: 140 }),
              gf: fc.integer({ min: 3, max: 30 }),
            }),
          ),
        ),
      )
      .map(([meals, grams]) => {
        const parts = meals.flatMap((foods, i) => [
          { food: foods[0], grams: grams[i].gp },
          { food: foods[1], grams: grams[i].gc },
          { food: foods[2], grams: grams[i].gf },
        ]);
        return {
          slots: meals.map((foods, i) => ({ slot: `Meal ${i}`, foods })),
          budget: budgetOf(parts),
        };
      }),
  );

describe("planPickedDay invariants", () => {
  it("lands the day within ±5 of every macro when the picks can reach it", () => {
    fc.assert(
      fc.property(reachablePickedDay, ({ slots, budget }) => {
        const plan = planPickedDay({ slots, budget });
        const tot = sumPlan(plan);
        expect(Math.abs(tot.protein_g - budget.protein_g)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(tot.carbs_g - budget.carbs_g)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(tot.fat_g - budget.fat_g)).toBeLessThanOrEqual(TOLERANCE);
      }),
    );
  });

  it("never plans a negative, infinite or absurd portion", () => {
    fc.assert(
      fc.property(reachablePickedDay, ({ slots, budget }) => {
        const plan = planPickedDay({ slots, budget });
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

  it("keeps every portion within the stock even when it binds", () => {
    fc.assert(
      fc.property(
        reachablePickedDay,
        fc.integer({ min: 20, max: 400 }),
        ({ slots, budget }, stockG) => {
          const stocked = slots.map((s) => ({
            slot: s.slot,
            foods: s.foods.map((f) => ({ ...f, available_g: stockG })),
          }));
          const plan = planPickedDay({ slots: stocked, budget });
          for (const meal of plan) {
            for (const p of meal.portions) {
              expect(p.grams).toBeLessThanOrEqual(stockG);
            }
          }
        },
      ),
    );
  });
});
