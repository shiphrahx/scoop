import { describe, expect, it } from "vitest";
import { mealToItems } from "@/lib/favourites";
import { sumItems, type MealPortion, type PlanItem } from "@/lib/types";

describe("mealToItems", () => {
  it("returns a hand-built meal's own items unchanged", () => {
    const items: PlanItem[] = [
      {
        name: "Rice",
        source: "pantry",
        off_barcode: null,
        grams: 150,
        kcal_100g: 130,
        protein_100g: 2.7,
        carbs_100g: 28,
        fat_100g: 0.3,
        fiber_100g: 0.4,
        sugar_100g: 0.1,
        satfat_100g: 0.1,
        sodium_mg_100g: 1,
      },
    ];
    expect(mealToItems({ items, portions: [] })).toBe(items);
  });

  it("recovers per-100g macros from an AI dish's portions", () => {
    // A portion carries the macros of THAT amount; the favourite needs per-100g,
    // so 62 g of chicken at 102 kcal → 165 kcal/100g. Re-summing the items must
    // reproduce the portion's macros exactly.
    const portions: MealPortion[] = [
      {
        name: "Chicken",
        grams: 200,
        kcal: 330,
        protein_g: 62,
        carbs_g: 0,
        fat_g: 7.2,
        fiber_g: 0,
        sugar_g: 0,
        satfat_g: 2,
        sodium_mg: 140,
        unit_g: 100,
        unit_label: "portion",
      },
    ];
    const items = mealToItems({ items: [], portions });
    expect(items).toHaveLength(1);
    expect(items[0].kcal_100g).toBeCloseTo(165, 5);
    expect(items[0].protein_100g).toBeCloseTo(31, 5);
    expect(items[0].unit_g).toBe(100);
    expect(items[0].unit_label).toBe("portion");
    // Re-summing the item reproduces the portion's macros.
    const total = sumItems(items);
    expect(Math.round(total.kcal)).toBe(330);
    expect(Math.round(total.protein_g)).toBe(62);
  });

  it("keeps a macro-less old portion as a name at its grams, without NaN", () => {
    const items = mealToItems({
      items: [],
      portions: [{ name: "Mystery", grams: 100 }],
    });
    expect(items[0].kcal_100g).toBe(0);
    expect(Number.isNaN(items[0].protein_100g)).toBe(false);
  });
});
