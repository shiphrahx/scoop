import { describe, expect, it } from "vitest";
import { sumItems } from "@/lib/types";
import type { PlanItem } from "@/lib/types";

function item(partial: Partial<PlanItem>): PlanItem {
  return {
    name: "x",
    source: "pantry",
    off_barcode: null,
    grams: 100,
    kcal_100g: 0,
    protein_100g: 0,
    carbs_100g: 0,
    fat_100g: 0,
    fiber_100g: 0,
    sugar_100g: 0,
    satfat_100g: 0,
    sodium_mg_100g: 0,
    ...partial,
  };
}

describe("sumItems", () => {
  it("returns all-zero totals for an empty list", () => {
    expect(sumItems([])).toEqual({
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      satfat_g: 0,
      sodium_mg: 0,
    });
  });

  it("scales per-100g values by grams", () => {
    // 250 g of a food at 200 kcal/100g = 500 kcal
    const totals = sumItems([
      item({ grams: 250, kcal_100g: 200, protein_100g: 20, sodium_mg_100g: 400 }),
    ]);
    expect(totals.kcal).toBe(500);
    expect(totals.protein_g).toBe(50);
    expect(totals.sodium_mg).toBe(1000);
  });

  it("adds multiple items across every nutrient", () => {
    const totals = sumItems([
      item({ grams: 100, kcal_100g: 100, fiber_100g: 5 }),
      item({ grams: 200, kcal_100g: 50, fiber_100g: 2 }),
    ]);
    expect(totals.kcal).toBe(100 + 100); // 100g*100 + 200g*50 => 100 + 100
    expect(totals.fiber_g).toBeCloseTo(5 + 4, 5); // 5 + (2 * 2)
  });

  it("handles sub-100g portions with fractional grams", () => {
    const totals = sumItems([item({ grams: 30, carbs_100g: 80 })]);
    expect(totals.carbs_g).toBeCloseTo(24, 5);
  });
});
