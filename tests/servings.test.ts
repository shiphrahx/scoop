import { describe, expect, it } from "vitest";
import {
  floorPortion,
  maxServingG,
  minServingG,
  type PantryFood,
} from "@/lib/mealplan";

// The planner's hard serving bounds: what a real portion of a food looks like at
// its smallest and its largest. The fit works inside these, so they are what
// stops both "couldn't fit your sauce" and "eat 600 g of potatoes".

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

describe("minServingG", () => {
  it("gives a fat spread a spread-sized serving", () => {
    expect(minServingG(f("Plant Butter", 531, 0, 0, 59))).toBeGreaterThanOrEqual(8);
    expect(minServingG(f("Plant Butter", 531, 0, 0, 59))).toBeLessThanOrEqual(15);
  });

  it("gives a sauce a spoonful, not a smear", () => {
    expect(minServingG(f("Barbecue Sauce", 172, 1, 40, 0.5))).toBeGreaterThanOrEqual(30);
  });

  it("never goes below a few grams even for oil", () => {
    expect(minServingG(f("Olive Oil", 900, 0, 0, 100))).toBeGreaterThanOrEqual(5);
  });
});

describe("maxServingG", () => {
  it("keeps a starchy side to a plausible plateful", () => {
    // 600 g of potatoes used to be inside the ceiling.
    expect(maxServingG(f("Potatoes", 77, 2, 17, 0.1))).toBeLessThanOrEqual(300);
  });

  it("caps a food by its energy, not just its mass", () => {
    // Dry rice is dense: a 300 g "serving" would be over 1000 kcal.
    expect(maxServingG(f("Basmati Rice", 349, 7.1, 78, 0.9))).toBeLessThanOrEqual(150);
  });

  it("keeps oils and spreads to a few tens of grams", () => {
    expect(maxServingG(f("Olive Oil", 900, 0, 0, 100))).toBeLessThanOrEqual(60);
  });

  it("counts a countable in whole units and stops at a sane number of them", () => {
    const egg = f("Eggs", 143, 13, 0.7, 9.5, { unit_g: 55, unit_label: "egg" });
    const most = maxServingG(egg);
    expect(most % 55).toBe(0);
    expect(most / 55).toBeLessThanOrEqual(4);
    // A dense unit is limited by energy before it hits the unit count.
    const bagel = f("Bagel", 264, 10, 49, 2, { unit_g: 85, unit_label: "bagel" });
    expect(maxServingG(bagel) / 85).toBeLessThanOrEqual(2);
  });

  it("never exceeds the stock", () => {
    expect(maxServingG(f("Tofu", 136, 14, 2, 8), 120)).toBeLessThanOrEqual(120);
    const bagel = f("Bagel", 264, 10, 49, 2, { unit_g: 85, unit_label: "bagel" });
    expect(maxServingG(bagel, 80)).toBe(0); // less than one bagel left
  });
});

describe("floorPortion", () => {
  it("is one whole unit for a countable", () => {
    const bagel = f("Bagel", 264, 10, 49, 2, { unit_g: 85, unit_label: "bagel" });
    expect(floorPortion(bagel, Infinity)).toBe(85);
  });

  it("is zero when the pack cannot cover a serving", () => {
    const bagel = f("Bagel", 264, 10, 49, 2, { unit_g: 85, unit_label: "bagel" });
    expect(floorPortion(bagel, 40)).toBe(0);
  });

  it("never exceeds the largest sensible serving", () => {
    const oil = f("Olive Oil", 900, 0, 0, 100);
    expect(floorPortion(oil, Infinity)).toBeLessThanOrEqual(maxServingG(oil));
  });
});
