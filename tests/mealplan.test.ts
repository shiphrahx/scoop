import { describe, expect, it } from "vitest";
import { suggestPantryMeals, type PantryFood } from "@/lib/mealplan";

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
