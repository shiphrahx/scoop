import { describe, it } from "vitest";
import { planPickedDay, maxServingG, type PantryFood } from "@/lib/mealplan";

const f = (n: string, k: number, p: number, c: number, fa: number, x: Partial<PantryFood> = {}): PantryFood =>
  ({ name: n, kcal_100g: k, protein_100g: p, carbs_100g: c, fat_100g: fa, ...x });

const cookedRice = f("Basmati Rice (cooked)", 130, 2.7, 28, 0.3, { unit_g: 200, unit_label: "medium" });
const mince = f("Vegemince", 130, 16, 5, 3, { unit_g: 100, unit_label: "portion" });
const broccoli = f("Tenderstem Broccoli", 27, 3.5, 2.3, 0.4);
const rocket = f("Wild Rocket", 24, 4.3, 0.3, 0.6);
const peppers = f("Roasted Red Bell Pepper Strips", 27, 0.9, 6.3, 0.3);
const banana = f("Banana", 89, 1.1, 23, 0.3, { unit_g: 120, unit_label: "banana" });
const powder = f("Phd Vegan Protein", 385, 75, 6, 6);

describe("repro: rice overshoot", () => {
  it("a rice day against a 215 g carb target", () => {
    console.log("max serving cooked rice:", maxServingG(cookedRice), "g");
    for (const budget of [
      { kcal: 2000, protein_g: 150, carbs_g: 215, fat_g: 55 },
      { kcal: 2100, protein_g: 140, carbs_g: 215, fat_g: 65 },
    ]) {
      const plan = planPickedDay({
        slots: [
          { slot: "Lunch", foods: [cookedRice, mince, broccoli, rocket, peppers] },
          { slot: "Snack", foods: [banana, powder] },
          { slot: "Dinner", foods: [cookedRice, mince, broccoli, rocket, peppers] },
        ],
        budget,
      });
      const t = plan.reduce((s, m) => ({ kcal: s.kcal + m.kcal, p: s.p + m.protein_g, c: s.c + m.carbs_g, f: s.f + m.fat_g }), { kcal: 0, p: 0, c: 0, f: 0 });
      console.log("\nbudget", budget);
      for (const m of plan) console.log(" ", m.slot, m.portions.map((p) => `${p.name} ${p.grams}g`).join(" | "));
      console.log("  DAY", t, "=> carbs", t.c - budget.carbs_g, "kcal", t.kcal - budget.kcal);
      console.log("  note:", plan[0].why);
    }
  });
});
