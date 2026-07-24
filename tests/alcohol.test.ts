import { describe, expect, it } from "vitest";
import {
  DRINK_PRESETS,
  alcoholCalories,
  alcoholGrams,
  allocateAlcohol,
  defaultAllocation,
  drinkMacros,
} from "@/lib/alcohol";

describe("alcoholGrams / alcoholCalories", () => {
  it("uses the ethanol formula: ml × ABV × 0.789 × 7", () => {
    // A pint of 4.5% lager: 568 × 0.045 × 0.789 = 20.17 g ethanol.
    expect(alcoholGrams(568, 4.5)).toBeCloseTo(20.17, 2);
    expect(alcoholCalories(568, 4.5)).toBeCloseTo(20.17 * 7, 1); // ≈ 141.2 kcal
  });

  it("a 25 ml single of 40% spirit is ~7.9 g / ~55 kcal", () => {
    expect(alcoholGrams(25, 40)).toBeCloseTo(7.89, 2);
    expect(alcoholCalories(25, 40)).toBeCloseTo(55.2, 1);
  });

  it("is zero for blank or zero volume/ABV", () => {
    expect(alcoholCalories(0, 5)).toBe(0);
    expect(alcoholCalories(500, 0)).toBe(0);
    expect(alcoholGrams(NaN, 5)).toBe(0);
  });
});

describe("allocateAlcohol", () => {
  it("books alcohol calories onto carbs by /4", () => {
    expect(allocateAlcohol(160, "carbs")).toEqual({ carbs_g: 40, fat_g: 0 });
  });

  it("books alcohol calories onto fat by /9", () => {
    expect(allocateAlcohol(180, "fat")).toEqual({ carbs_g: 0, fat_g: 20 });
  });

  it("splits half the calories to each", () => {
    const { carbs_g, fat_g } = allocateAlcohol(180, "split");
    expect(carbs_g).toBeCloseTo(90 / 4, 6); // 22.5
    expect(fat_g).toBeCloseTo(90 / 9, 6); // 10
  });

  it("never divides by 7 — carbs booking carries the full calories", () => {
    const kcal = 210;
    const { carbs_g } = allocateAlcohol(kcal, "carbs");
    expect(carbs_g * 4).toBeCloseTo(kcal, 6);
  });
});

describe("drinkMacros", () => {
  it("adds real drink carbs separately from the booked alcohol calories", () => {
    // 500 ml at 5% = 19.7 g ethanol = 138 kcal. Booked as carbs = 34.5 g, plus
    // 13 g real carbs on top → 47.5 g carbs; protein and fat stay 0.
    const m = drinkMacros({ volumeMl: 500, abvPct: 5, allocation: "carbs", extraCarbsG: 13 });
    const alcKcal = alcoholCalories(500, 5);
    expect(m.carbs_g).toBeCloseTo(alcKcal / 4 + 13, 6);
    expect(m.fat_g).toBe(0);
    expect(m.protein_g).toBe(0);
    expect(m.sugar_g).toBe(13); // mixer/residual carbs surface as sugar
    expect(m.alcohol_g).toBeCloseTo(alcoholGrams(500, 5), 6);
  });

  it("keeps kcal correct whichever macro the alcohol is booked to", () => {
    const base = { volumeMl: 500, abvPct: 5, extraCarbsG: 10 } as const;
    const asCarbs = drinkMacros({ ...base, allocation: "carbs" });
    const asFat = drinkMacros({ ...base, allocation: "fat" });
    // Same total calories either way — only the macro split moves.
    expect(asCarbs.kcal).toBeCloseTo(asFat.kcal, 6);
    // And kcal equals carbs×4 + fat×9 (+ protein×4) — internally consistent.
    for (const m of [asCarbs, asFat]) {
      expect(m.kcal).toBeCloseTo(m.carbs_g * 4 + m.fat_g * 9 + m.protein_g * 4, 6);
    }
  });

  it("supports a cream liqueur: real fat and carbs on top", () => {
    const m = drinkMacros({
      volumeMl: 50,
      abvPct: 17,
      allocation: "carbs",
      extraCarbsG: 12,
      extraFatG: 6,
    });
    expect(m.fat_g).toBeCloseTo(6, 6); // all fat is real (booked to carbs)
    expect(m.carbs_g).toBeCloseTo(alcoholCalories(50, 17) / 4 + 12, 6);
  });
});

describe("defaultAllocation", () => {
  it("picks whichever macro has more calories left", () => {
    expect(defaultAllocation(100, 20)).toBe("carbs"); // 400 kcal vs 180
    expect(defaultAllocation(10, 30)).toBe("fat"); // 40 kcal vs 270
  });

  it("falls back to carbs when there's nothing to go on", () => {
    expect(defaultAllocation(0, 0)).toBe("carbs");
    expect(defaultAllocation(null, null)).toBe("carbs");
  });
});

describe("DRINK_PRESETS", () => {
  it("every preset produces positive calories", () => {
    for (const p of DRINK_PRESETS) {
      expect(alcoholCalories(p.volumeMl, p.abvPct)).toBeGreaterThan(0);
    }
  });
});
