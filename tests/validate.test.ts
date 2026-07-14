import { describe, expect, it } from "vitest";
import {
  energyFromMacros,
  isPlausibleFood,
  isPlausibleMeal,
  macrosExplainKcal,
} from "@/lib/validate";

// The point of these checks is to reject a number the model made up while still
// accepting every real food. A check that fails honest food is worse than no
// check: the user scans a yoghurt, gets told it's implausible, and stops
// trusting the app. So the real-food cases matter as much as the junk ones.

describe("isPlausibleMeal", () => {
  it("accepts an ordinary estimated dish", () => {
    // Porridge with banana and honey — roughly what the model would return.
    expect(isPlausibleMeal({ kcal: 420, protein_g: 12, carbs_g: 72, fat_g: 8 })).toBe(true);
    // A chicken and rice plate.
    expect(isPlausibleMeal({ kcal: 620, protein_g: 55, carbs_g: 65, fat_g: 12 })).toBe(true);
    // A salad: light, and mostly fat by calories.
    expect(isPlausibleMeal({ kcal: 240, protein_g: 6, carbs_g: 10, fat_g: 20 })).toBe(true);
  });

  it("accepts a meal whose calories don't land exactly on 4/4/9", () => {
    // Fibre is counted in carbs but yields about 2 kcal/g, and the model rounds.
    // A high-fibre meal legitimately reads low against the Atwater sum.
    expect(isPlausibleMeal({ kcal: 350, protein_g: 15, carbs_g: 60, fat_g: 8 })).toBe(true);
  });

  it("rejects calories that no amount of those macros could produce", () => {
    // 60 g of protein is 240 kcal on its own. Zero is not a number this food has.
    expect(isPlausibleMeal({ kcal: 0, protein_g: 60, carbs_g: 40, fat_g: 10 })).toBe(false);
    // And the other way: 3000 kcal out of almost nothing.
    expect(isPlausibleMeal({ kcal: 3000, protein_g: 5, carbs_g: 5, fat_g: 2 })).toBe(false);
  });

  it("rejects negative food", () => {
    expect(isPlausibleMeal({ kcal: -400, protein_g: 30, carbs_g: 40, fat_g: 10 })).toBe(false);
    expect(isPlausibleMeal({ kcal: 400, protein_g: -30, carbs_g: 40, fat_g: 10 })).toBe(false);
  });

  it("rejects a portion nobody is eating", () => {
    // 9000 g of protein in one meal. Logged, it would swallow the week's target.
    expect(
      isPlausibleMeal({ kcal: 4000, protein_g: 9000, carbs_g: 0, fat_g: 0 }),
    ).toBe(false);
  });

  it("rejects NaN, Infinity and missing fields", () => {
    expect(isPlausibleMeal({ kcal: Number.NaN, protein_g: 1, carbs_g: 1, fat_g: 1 })).toBe(false);
    expect(
      isPlausibleMeal({ kcal: Number.POSITIVE_INFINITY, protein_g: 1, carbs_g: 1, fat_g: 1 }),
    ).toBe(false);
    expect(isPlausibleMeal({ kcal: 400, protein_g: 30 })).toBe(false);
    expect(isPlausibleMeal(null)).toBe(false);
    expect(isPlausibleMeal("400 kcal")).toBe(false);
  });

  it("accepts a genuinely empty item (black coffee, water)", () => {
    expect(isPlausibleMeal({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })).toBe(true);
  });
});

describe("isPlausibleFood (per 100 g)", () => {
  it("accepts real foods off a label", () => {
    // Chicken breast, olive oil, rice, cheddar — the range of real density.
    expect(
      isPlausibleFood({ kcal_100g: 165, protein_100g: 31, carbs_100g: 0, fat_100g: 3.6 }),
    ).toBe(true);
    expect(
      isPlausibleFood({ kcal_100g: 900, protein_100g: 0, carbs_100g: 0, fat_100g: 100 }),
    ).toBe(true);
    expect(
      isPlausibleFood({ kcal_100g: 130, protein_100g: 2.7, carbs_100g: 28, fat_100g: 0.3 }),
    ).toBe(true);
    expect(
      isPlausibleFood({ kcal_100g: 402, protein_100g: 25, carbs_100g: 1.3, fat_100g: 33 }),
    ).toBe(true);
  });

  it("accepts a food with no calories in it", () => {
    expect(
      isPlausibleFood({ kcal_100g: 0, protein_100g: 0, carbs_100g: 0, fat_100g: 0 }),
    ).toBe(true);
  });

  it("rejects more than 100 g of stuff in 100 g of food", () => {
    // Physics, not nutrition. A misread label that puts 60 g protein and 60 g
    // carbs in 100 g would otherwise become a pantry item the planner solves on.
    expect(
      isPlausibleFood({ kcal_100g: 500, protein_100g: 60, carbs_100g: 60, fat_100g: 5 }),
    ).toBe(false);
  });

  it("rejects a food denser in calories than pure fat", () => {
    expect(
      isPlausibleFood({ kcal_100g: 5000, protein_100g: 10, carbs_100g: 10, fat_100g: 10 }),
    ).toBe(false);
  });

  it("rejects calories that contradict the macros", () => {
    // 31 g of protein is 124 kcal. 10 is not possible.
    expect(
      isPlausibleFood({ kcal_100g: 10, protein_100g: 31, carbs_100g: 0, fat_100g: 3.6 }),
    ).toBe(false);
  });

  it("rejects negative macros", () => {
    expect(
      isPlausibleFood({ kcal_100g: 165, protein_100g: -31, carbs_100g: 0, fat_100g: 3.6 }),
    ).toBe(false);
  });
});

describe("energyFromMacros", () => {
  it("uses the Atwater factors", () => {
    expect(energyFromMacros({ protein_g: 10, carbs_g: 20, fat_g: 5 })).toBe(165);
  });
});

describe("macrosExplainKcal", () => {
  it("gives small numbers a flat 100 kcal of slack", () => {
    // A 40 kcal item whose macros imply 100 is still believable — rounding on
    // tiny numbers is proportionally huge.
    expect(macrosExplainKcal({ kcal: 40, protein_g: 5, carbs_g: 15, fat_g: 2 })).toBe(true);
  });

  it("gives big numbers proportional slack, not a flat one", () => {
    // 2000 kcal claimed, 2400 implied: 20% out, believable for an estimate.
    expect(macrosExplainKcal({ kcal: 2000, protein_g: 100, carbs_g: 200, fat_g: 133 })).toBe(true);
    // 2000 claimed, 4000 implied: not the same food.
    expect(macrosExplainKcal({ kcal: 2000, protein_g: 200, carbs_g: 400, fat_g: 178 })).toBe(false);
  });
});
