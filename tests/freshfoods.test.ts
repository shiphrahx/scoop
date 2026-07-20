import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  cookedStapleFor,
  defaultSize,
  macrosForGrams,
  pantryUnitLabel,
} from "@/lib/freshfoods";
import type { UnitOption } from "@/lib/types";

describe("cookedStapleFor", () => {
  it("maps plain dry staples to their cooked reference food", () => {
    expect(cookedStapleFor("Basmati Rice")).toBe("White Rice (cooked)");
    expect(cookedStapleFor("Wholegrain Brown Rice")).toBe("Brown Rice (cooked)");
    expect(cookedStapleFor("Penne Pasta")).toBe("Pasta (cooked)");
    expect(cookedStapleFor("Spaghetti")).toBe("Pasta (cooked)");
    expect(cookedStapleFor("Couscous")).toBe("Couscous (cooked)");
    expect(cookedStapleFor("Organic Quinoa")).toBe("Quinoa (cooked)");
    expect(cookedStapleFor("Rolled Oats")).toBe("Porridge (cooked)");
  });

  it("prefers brown rice over the bare rice rule", () => {
    expect(cookedStapleFor("Tilda Brown Rice 500g")).toBe("Brown Rice (cooked)");
  });

  it("refuses products that aren't the plain staple", () => {
    expect(cookedStapleFor("Rice Milk")).toBeNull();
    expect(cookedStapleFor("Rice Cakes")).toBeNull();
    expect(cookedStapleFor("Rice Noodles")).toBeNull();
    expect(cookedStapleFor("Oat Cereal Bar")).toBeNull();
    expect(cookedStapleFor("Egg Fried Rice")).toBeNull();
    expect(cookedStapleFor("Rice Pudding")).toBeNull();
  });

  it("doesn't fire on a word that merely contains a staple", () => {
    expect(cookedStapleFor("Priced Down Ketchup")).toBeNull();
    expect(cookedStapleFor("Liquorice")).toBeNull();
  });

  it("returns null for a non-staple food", () => {
    expect(cookedStapleFor("Chicken Breast")).toBeNull();
    expect(cookedStapleFor("Cheddar Cheese")).toBeNull();
  });
});

describe("pantryUnitLabel", () => {
  it("reads as 'size food', lower-cased", () => {
    expect(pantryUnitLabel("Banana", "medium")).toBe("medium banana");
    expect(pantryUnitLabel("Sweet Potato", "large")).toBe("large sweet potato");
  });

  it("falls back to the food name when there's no size", () => {
    expect(pantryUnitLabel("Avocado", "")).toBe("avocado");
  });

  it("trims stray whitespace on both parts", () => {
    expect(pantryUnitLabel("  Apple ", " small ")).toBe("small apple");
  });
});

describe("defaultSize", () => {
  const s = (label: string, grams: number): UnitOption => ({ label, grams });

  it("prefers a size literally called medium", () => {
    const sizes = [s("small", 101), s("medium", 118), s("large", 136)];
    expect(defaultSize(sizes)).toEqual(s("medium", 118));
  });

  it("takes the middle by weight when there's no 'medium'", () => {
    const sizes = [s("regular", 60), s("jumbo", 200), s("mini", 20)];
    // Sorted 20/60/200 → the middle is 60.
    expect(defaultSize(sizes)).toEqual(s("regular", 60));
  });

  it("picks the smaller of two when there's no true middle", () => {
    const sizes = [s("big", 200), s("wee", 50)];
    expect(defaultSize(sizes)).toEqual(s("wee", 50));
  });

  it("is null for a food with no sizes", () => {
    expect(defaultSize([])).toBeNull();
  });

  it("always returns one of the given sizes", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            label: fc.string(),
            grams: fc.double({ min: 1, max: 1000, noNaN: true }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        (sizes) => {
          const pick = defaultSize(sizes)!;
          expect(sizes).toContainEqual(pick);
        },
      ),
    );
  });
});

describe("macrosForGrams", () => {
  const banana = { kcal_100g: 89, protein_100g: 1.1, carbs_100g: 22.8, fat_100g: 0.3 };

  it("scales per-100g macros to the portion weight", () => {
    // A 118 g medium banana.
    const m = macrosForGrams(banana, 118);
    expect(m.kcal).toBeCloseTo(105.02, 2);
    expect(m.protein_g).toBeCloseTo(1.298, 3);
    expect(m.carbs_g).toBeCloseTo(26.904, 3);
    expect(m.fat_g).toBeCloseTo(0.354, 3);
  });

  it("is zero for a zero-gram portion", () => {
    expect(macrosForGrams(banana, 0)).toEqual({
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    });
  });

  it("is linear: double the grams, double the macros", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 500, noNaN: true }),
        (grams) => {
          const one = macrosForGrams(banana, grams);
          const two = macrosForGrams(banana, grams * 2);
          expect(two.kcal).toBeCloseTo(one.kcal * 2, 6);
          expect(two.carbs_g).toBeCloseTo(one.carbs_g * 2, 6);
        },
      ),
    );
  });
});
