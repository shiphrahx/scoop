import { describe, expect, it } from "vitest";
import {
  planPantryDay,
  suggestPantryMeals,
  type PantryFood,
} from "@/lib/mealplan";

const chicken: PantryFood = {
  name: "Chicken Breast",
  kcal_100g: 165,
  protein_100g: 31,
  carbs_100g: 0,
  fat_100g: 3.6,
};
const rice: PantryFood = {
  name: "Basmati Rice",
  kcal_100g: 130,
  protein_100g: 2.7,
  carbs_100g: 28,
  fat_100g: 0.3,
};
const oil: PantryFood = {
  name: "Olive Oil",
  kcal_100g: 900,
  protein_100g: 0,
  carbs_100g: 0,
  fat_100g: 100,
};
const water: PantryFood = {
  name: "Sparkling Water",
  kcal_100g: 0,
  protein_100g: 0,
  carbs_100g: 0,
  fat_100g: 0,
};

const budget = { kcal: 1800, protein_g: 150, carbs_g: 180, fat_g: 60 };
const zero = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

describe("planPantryDay", () => {
  it("builds a meal per empty slot from the pantry", () => {
    const plan = planPantryDay({
      pantry: [chicken, rice, oil, water],
      budget,
      fixed: zero,
      emptySlots: ["Lunch", "Dinner"],
    });
    expect(plan).toHaveLength(2);
    for (const meal of plan) {
      const names = meal.portions.map((p) => p.name);
      expect(names).toContain("Chicken Breast");
      expect(names).toContain("Basmati Rice");
      // Never lists the zero-macro water.
      expect(names).not.toContain("Sparkling Water");
      expect(meal.origin).toBe("ai");
    }
  });

  it("lands each meal near its share of the macro budget", () => {
    const plan = planPantryDay({
      pantry: [chicken, rice, oil],
      budget,
      fixed: zero,
      emptySlots: ["Lunch", "Dinner"],
    });
    // Each slot should aim at half the day's protein (~75 g).
    for (const meal of plan) {
      expect(meal.protein_g).toBeGreaterThan(60);
      expect(meal.protein_g).toBeLessThan(90);
      expect(meal.carbs_g).toBeGreaterThan(70);
    }
  });

  it("keeps the day total within ±5 of every macro budget", () => {
    const target = { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };
    const plan = planPantryDay({
      pantry: [chicken, rice, oil],
      budget: target,
      fixed: zero,
      emptySlots: ["Breakfast", "Lunch", "Snack", "Dinner"],
    });
    const tot = plan.reduce(
      (s, m) => ({
        protein_g: s.protein_g + m.protein_g,
        carbs_g: s.carbs_g + m.carbs_g,
        fat_g: s.fat_g + m.fat_g,
      }),
      { protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
    expect(Math.abs(tot.protein_g - target.protein_g)).toBeLessThanOrEqual(5);
    expect(Math.abs(tot.carbs_g - target.carbs_g)).toBeLessThanOrEqual(5);
    expect(Math.abs(tot.fat_g - target.fat_g)).toBeLessThanOrEqual(5);
  });

  it("budgets around meals the user already planned", () => {
    const plan = planPantryDay({
      pantry: [chicken, rice, oil],
      budget,
      fixed: { kcal: 900, protein_g: 120, carbs_g: 90, fat_g: 30 },
      emptySlots: ["Dinner"],
    });
    // Only ~30 g protein left after the fixed meals → a smaller portion.
    expect(plan[0].protein_g).toBeLessThan(45);
  });

  it("returns nothing when there are no empty slots", () => {
    expect(
      planPantryDay({ pantry: [chicken], budget, fixed: zero, emptySlots: [] }),
    ).toEqual([]);
  });
});

describe("suggestPantryMeals", () => {
  it("builds dishes around the chosen carb + protein", () => {
    const meals = suggestPantryMeals({
      pantry: [chicken, rice, oil],
      remaining: { kcal: 600, protein_g: 45, carbs_g: 60, fat_g: 20 },
      carb: "Basmati Rice",
      protein: "Chicken Breast",
    });
    expect(meals.length).toBeGreaterThan(0);
    expect(meals[0].uses).toContain("Chicken Breast");
    expect(meals[0].uses).toContain("Basmati Rice");
    expect(meals[0].kcal).toBeGreaterThan(0);
  });

  it("returns [] when the pantry has no carb or protein", () => {
    expect(
      suggestPantryMeals({ pantry: [oil], remaining: budget }),
    ).toEqual([]);
  });
});
