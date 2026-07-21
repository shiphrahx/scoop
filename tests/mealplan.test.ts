import { describe, expect, it } from "vitest";
import {
  planPickedDay,
  portionGrams,
  snapGrams,
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
const budget = { kcal: 1800, protein_g: 150, carbs_g: 180, fat_g: 60 };

describe("snapGrams", () => {
  const bagel: PantryFood = { ...rice, name: "Bagel", unit_g: 85, unit_label: "bagel" };

  it("rounds a weighed food to the nearest gram", () => {
    expect(snapGrams(137.4, rice)).toBe(137);
    expect(snapGrams(137.6, rice)).toBe(138);
  });

  it("snaps a countable food to a whole number of units", () => {
    expect(snapGrams(137, bagel)).toBe(170); // ~1.6 bagels → 2
    expect(snapGrams(100, bagel)).toBe(85); // ~1.2 bagels → 1
    expect(snapGrams(30, bagel)).toBe(0); // under half a bagel → none
  });

  it("treats a zero or missing unit as weighed", () => {
    expect(snapGrams(50.7, { ...rice, unit_g: 0 })).toBe(51);
    expect(snapGrams(50.7, { ...rice, unit_g: null })).toBe(51);
  });
});

describe("portionGrams", () => {
  const bagel: PantryFood = { ...rice, name: "Bagel", unit_g: 85, unit_label: "bagel" };

  it("never leaves a fractional unit, even when the stock cap sits mid-unit", () => {
    // Solver wants ~3 bagels (255 g) but only 200 g in stock: floor to 2 whole
    // bagels (170 g), never 200 g (2.35 bagels).
    expect(portionGrams(255, bagel, 200)).toBe(170);
    expect(portionGrams(255, bagel, 170)).toBe(170);
    expect(portionGrams(40, bagel, 500)).toBe(0); // under half a bagel → none
    expect(portionGrams(130, bagel, 500)).toBe(170); // ~1.5 → 2
  });

  it("clamps a weighed food to the nearest gram within the cap", () => {
    expect(portionGrams(137.6, rice, 500)).toBe(138);
    expect(portionGrams(600, rice, 400)).toBe(400);
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

  it("never portions more of a food than its pack holds", () => {
    // A 300 g pack of tofu, and a big protein target that would otherwise want
    // far more than a pack. The suggestion must not exceed the 300 g in stock.
    const tofu: PantryFood = {
      name: "Silken Tofu",
      kcal_100g: 55,
      protein_100g: 5,
      carbs_100g: 2,
      fat_100g: 3,
      available_g: 300,
    };
    const meals = suggestPantryMeals({
      pantry: [tofu, rice],
      remaining: { kcal: 1200, protein_g: 120, carbs_g: 100, fat_g: 30 },
      carb: "Basmati Rice",
      protein: "Silken Tofu",
    });
    const tofuGrams = meals
      .flatMap((m) => m.portions)
      .filter((p) => p.name === "Silken Tofu")
      .map((p) => p.grams);
    expect(tofuGrams.length).toBeGreaterThan(0);
    for (const g of tofuGrams) expect(g).toBeLessThanOrEqual(300);
  });
});

describe("planPickedDay", () => {
  it("never portions a picked food past its pack, even chasing a big macro", () => {
    // A 300 g pack of tofu is the meal's only protein, and the day wants far
    // more protein than a pack can give. Without the stock cap the solver would
    // clamp tofu to its role ceiling (350 g); with it, one pack is the limit.
    const tofu: PantryFood = {
      name: "Silken Tofu",
      kcal_100g: 55,
      protein_100g: 14,
      carbs_100g: 2,
      fat_100g: 8,
      available_g: 300,
    };
    const meals = planPickedDay({
      slots: [{ slot: "Dinner", foods: [tofu, rice] }],
      budget: { kcal: 1800, protein_g: 150, carbs_g: 180, fat_g: 60 },
    });
    const tofuGrams = meals
      .flatMap((m) => m.portions)
      .filter((p) => p.name === "Silken Tofu")
      .map((p) => p.grams);
    expect(tofuGrams.length).toBeGreaterThan(0);
    for (const g of tofuGrams) expect(g).toBeLessThanOrEqual(300);
  });

  it("holds a pinned food and moves the rest to keep the day on target", () => {
    // The user pinned the rice at 100 g. The solve must leave it there and grow
    // the chicken to reach the day's protein, rather than re-portioning rice.
    const pinnedRice: PantryFood = { ...rice, pinned_g: 100 };
    const meals = planPickedDay({
      slots: [{ slot: "Dinner", foods: [chicken, pinnedRice] }],
      budget,
    });
    const portions = meals.flatMap((m) => m.portions);
    expect(portions.find((p) => p.name === rice.name)?.grams).toBe(100);
    // Chicken carries the protein target essentially alone now.
    expect(portions.find((p) => p.name === chicken.name)?.grams ?? 0).toBeGreaterThan(300);
  });

  it("holds a pinned vegetable at the user's amount, not the filler serving", () => {
    // Onion is a filler — normally a fixed ~30 kcal serving. Pinned to 40 g, it
    // must stay at 40 g instead of being reset to the standard veg portion.
    const onion: PantryFood = {
      name: "Onion",
      kcal_100g: 40,
      protein_100g: 1.1,
      carbs_100g: 9.3,
      fat_100g: 0.1,
      pinned_g: 40,
    };
    const meals = planPickedDay({
      slots: [{ slot: "Dinner", foods: [chicken, rice, onion] }],
      budget,
    });
    const onionG = meals
      .flatMap((m) => m.portions)
      .find((p) => p.name === "Onion")?.grams;
    expect(onionG).toBe(40);
  });
});
