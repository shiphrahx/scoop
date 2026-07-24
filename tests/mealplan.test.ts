import { describe, expect, it } from "vitest";
import {
  isCountable,
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

// A cooked staple as a pantry row: it carries a "medium" serving preset
// (unit_g) for quick manual logging, but must still be portioned by weight.
const cookedRice: PantryFood = {
  name: "Basmati Rice (cooked)",
  kcal_100g: 130,
  protein_100g: 2.7,
  carbs_100g: 28.2,
  fat_100g: 0.3,
  unit_g: 200,
  unit_label: "medium basmati rice (cooked)",
};

describe("isCountable", () => {
  const bagel: PantryFood = { ...rice, name: "Bagel", unit_g: 85, unit_label: "bagel" };

  it("is true for a discrete item with a unit", () => {
    expect(isCountable(bagel)).toBe(true);
    expect(isCountable({ ...rice, name: "Banana", unit_g: 118, unit_label: "medium banana" })).toBe(true);
  });

  it("is false for a bulk staple even with a serving preset", () => {
    // Rice/pasta carry small/medium/large presets but are served by weight.
    expect(isCountable(cookedRice)).toBe(false);
    expect(
      isCountable({ ...cookedRice, name: "Pasta (cooked)", unit_g: 240, unit_label: "medium pasta (cooked)" }),
    ).toBe(false);
    expect(
      isCountable({ ...cookedRice, name: "Penne (cooked)", unit_g: 240, unit_label: "medium penne (cooked)" }),
    ).toBe(false);
  });

  it("is false when there is no unit", () => {
    expect(isCountable(rice)).toBe(false);
    expect(isCountable({ ...rice, unit_g: 0 })).toBe(false);
  });
});

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

  it("scales a cooked staple by weight and leaves room for the other meals (issue #27)", () => {
    // Lunch and dinner both have rice + mince + oil; a snack has a banana and
    // protein powder. Rice carries a 200 g "medium" serving preset — but locking
    // it to whole 200 g servings ate the whole day and starved the snack. Rice
    // must portion by weight so every meal, snack included, gets its share.
    const mince: PantryFood = {
      name: "Vegan Mince",
      kcal_100g: 110,
      protein_100g: 15,
      carbs_100g: 5,
      fat_100g: 3,
    };
    const banana: PantryFood = {
      name: "Banana",
      kcal_100g: 89,
      protein_100g: 1.1,
      carbs_100g: 23,
      fat_100g: 0.3,
      unit_g: 118,
      unit_label: "medium banana",
    };
    const proteinPowder: PantryFood = {
      name: "Protein Powder",
      kcal_100g: 380,
      protein_100g: 80,
      carbs_100g: 8,
      fat_100g: 5,
    };
    const meals = planPickedDay({
      slots: [
        { slot: "Lunch", foods: [cookedRice, mince, oil] },
        { slot: "Snack", foods: [banana, proteinPowder] },
        { slot: "Dinner", foods: [cookedRice, mince, oil] },
      ],
      budget: { kcal: 1800, protein_g: 150, carbs_g: 180, fat_g: 60 },
    });

    // The snack survived — before the fix rice consumed the day and left none.
    const snack = meals.find((m) => m.slot === "Snack");
    expect(snack).toBeDefined();
    expect((snack?.portions ?? []).find((p) => p.name === "Banana")?.grams ?? 0).toBeGreaterThan(0);

    // Rice is portioned by weight: no unit rides on its portion, and it isn't
    // locked to a whole multiple of the 200 g serving.
    const ricePortions = meals
      .flatMap((m) => m.portions)
      .filter((p) => p.name === "Basmati Rice (cooked)");
    expect(ricePortions.length).toBeGreaterThan(0);
    for (const p of ricePortions) {
      expect(p.unit_g).toBeUndefined();
      expect(p.grams % 200).not.toBe(0);
    }
  });
});
