import { describe, expect, it } from "vitest";
import {
  DEFAULT_SURPLUS_CARBS_G,
  HIGH_DAYS_BY_PACE,
  HIGH_DAYS_SAFE_MAX,
  HIGH_DAYS_SAFE_MIN,
  MAINTENANCE_HIGH_DAYS,
  MIN_LOW_DAY_CARBS_G,
  SAFE_KCAL_FLOOR,
  WEEK_DAYS,
  clampHighDaysChoice,
  computeSurplusCarbs,
  dayCarbDelta,
  dayTarget,
  effectiveHighDays,
  highDaysRemaining,
  lowDayCarbDrop,
  recommendedHighDays,
  type CycleConfig,
} from "@/lib/highday";
import type { Macros } from "@/lib/types";

// A flat base daily target to redistribute.
const base: Required<Macros> = {
  kcal: 2000,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 67,
  fiber_g: 28,
  sugar_g: 50,
  satfat_g: 22,
  sodium_mg: 2300,
};

const cfg = (over: Partial<CycleConfig> = {}): CycleConfig => ({
  enabled: true,
  highDaysPerWeek: 2,
  surplusCarbsG: DEFAULT_SURPLUS_CARBS_G,
  ...over,
});

describe("recommendedHighDays", () => {
  it("maps loss pace to a high-day count", () => {
    expect(recommendedHighDays("aggressive")).toBe(1);
    expect(recommendedHighDays("steady")).toBe(2);
    expect(recommendedHighDays("gentle")).toBe(3);
    expect(HIGH_DAYS_BY_PACE.aggressive).toBe(1);
  });

  it("gives maintenance the top of the range regardless of pace", () => {
    expect(recommendedHighDays("aggressive", "maintenance")).toBe(MAINTENANCE_HIGH_DAYS);
    expect(recommendedHighDays("steady", "maintenance")).toBe(3);
  });

  it("uses the pace on a deficit or diet break", () => {
    expect(recommendedHighDays("aggressive", "deficit")).toBe(1);
    expect(recommendedHighDays("gentle", "diet_break")).toBe(3);
  });
});

describe("effectiveHighDays", () => {
  it("clamps to a range that always leaves one low day", () => {
    expect(effectiveHighDays(-2)).toBe(0);
    expect(effectiveHighDays(2)).toBe(2);
    expect(effectiveHighDays(7)).toBe(WEEK_DAYS - 1); // never all seven
    expect(effectiveHighDays(99)).toBe(6);
    expect(effectiveHighDays(1.9)).toBe(1); // floors fractions
  });
});

describe("lowDayCarbDrop", () => {
  it("balances the surplus across the low days", () => {
    // 2 high days × 75 g must be given back by 5 low days → 30 g each.
    expect(lowDayCarbDrop(75, 2)).toBeCloseTo(30, 6);
    // 1 high day × 75 g over 6 low days → 12.5 g each.
    expect(lowDayCarbDrop(75, 1)).toBeCloseTo(12.5, 6);
  });

  it("is zero when there's nothing to redistribute", () => {
    expect(lowDayCarbDrop(75, 0)).toBe(0);
    expect(lowDayCarbDrop(0, 2)).toBe(0);
  });
});

describe("clampHighDaysChoice", () => {
  it("holds the user's count inside the safe adjustable range", () => {
    expect(clampHighDaysChoice(0)).toBe(HIGH_DAYS_SAFE_MIN);
    expect(clampHighDaysChoice(2)).toBe(2);
    expect(clampHighDaysChoice(99)).toBe(HIGH_DAYS_SAFE_MAX);
    expect(clampHighDaysChoice(2.6)).toBe(3); // rounds
    expect(clampHighDaysChoice(NaN)).toBe(HIGH_DAYS_SAFE_MIN);
  });
});

describe("computeSurplusCarbs", () => {
  it("calculates a surplus from the day's carbs, in clean steps", () => {
    // Ideal = 50% of 200 g = 100 g, and the low days can give it back here.
    const { surplusCarbsG, capped } = computeSurplusCarbs(base, 2);
    expect(surplusCarbsG).toBe(100);
    expect(capped).toBe(false);
    expect(surplusCarbsG % 5).toBe(0);
  });

  it("caps the surplus so low days keep a safe minimum of carbs", () => {
    // Small carb base: half of 70 g = 35 g ideal, but with 3 high days each of
    // the 4 low days must keep >= MIN_LOW_DAY_CARBS_G, capping the surplus below.
    const small = { ...base, carbs_g: 70, kcal: 2000 };
    const { surplusCarbsG, capped } = computeSurplusCarbs(small, 3);
    expect(capped).toBe(true);
    const low = dayTarget(small, false, cfg({ highDaysPerWeek: 3, surplusCarbsG }));
    expect(low.carbs_g).toBeGreaterThanOrEqual(MIN_LOW_DAY_CARBS_G);
  });

  it("caps the surplus so no low day drops below the calorie floor", () => {
    // A day already near the floor has almost no room to cut.
    const lean = { ...base, kcal: SAFE_KCAL_FLOOR + 100, carbs_g: 150 };
    const { surplusCarbsG } = computeSurplusCarbs(lean, 3);
    const low = dayTarget(lean, false, cfg({ highDaysPerWeek: 3, surplusCarbsG }));
    expect(low.kcal).toBeGreaterThanOrEqual(SAFE_KCAL_FLOOR);
  });

  it("is zero when there's nothing to cycle", () => {
    expect(computeSurplusCarbs(base, 0).surplusCarbsG).toBe(0);
    expect(computeSurplusCarbs({ ...base, carbs_g: 0 }, 2).surplusCarbsG).toBe(0);
  });
});

describe("dayCarbDelta", () => {
  it("adds the full surplus on a high day, a share back on a low day", () => {
    expect(dayCarbDelta(true, cfg())).toBe(75);
    expect(dayCarbDelta(false, cfg())).toBeCloseTo(-30, 6);
  });

  it("is flat when cycling is off or there are no high days", () => {
    expect(dayCarbDelta(true, cfg({ enabled: false }))).toBe(0);
    expect(dayCarbDelta(true, cfg({ highDaysPerWeek: 0 }))).toBe(0);
  });
});

describe("dayTarget", () => {
  it("moves carbs (and energy) but holds protein and fat", () => {
    const high = dayTarget(base, true, cfg());
    expect(high.carbs_g).toBe(275); // +75 g
    expect(high.kcal).toBe(2000 + 75 * 4); // energy follows carbs
    expect(high.protein_g).toBe(base.protein_g);
    expect(high.fat_g).toBe(base.fat_g);

    const low = dayTarget(base, false, cfg());
    expect(low.carbs_g).toBeCloseTo(170, 6); // −30 g
    expect(low.kcal).toBeCloseTo(2000 - 30 * 4, 6);
    expect(low.protein_g).toBe(base.protein_g);
  });

  it("returns the flat target when cycling is off", () => {
    expect(dayTarget(base, true, cfg({ enabled: false }))).toEqual(base);
    expect(dayTarget(base, false, cfg({ enabled: false }))).toEqual(base);
  });

  it("never drives carbs negative", () => {
    const tiny: Required<Macros> = { ...base, carbs_g: 10, kcal: 500 };
    const low = dayTarget(tiny, false, cfg({ highDaysPerWeek: 6, surplusCarbsG: 100 }));
    expect(low.carbs_g).toBeGreaterThanOrEqual(0);
  });
});

describe("weekly-total invariant", () => {
  // The whole point: a week of high + low days sums to the same total as seven
  // flat days. Checked across every allowed high-day count and a couple of
  // surpluses, on the raw (unrounded) values.
  const flatWeek = (m: Required<Macros>) => ({
    kcal: m.kcal * WEEK_DAYS,
    carbs_g: m.carbs_g * WEEK_DAYS,
    protein_g: m.protein_g * WEEK_DAYS,
    fat_g: m.fat_g * WEEK_DAYS,
  });

  for (let highDays = 1; highDays <= WEEK_DAYS - 1; highDays++) {
    for (const surplusCarbsG of [50, 75, 120]) {
      // Only meaningful where the low day can actually give the surplus back —
      // i.e. its carb drop doesn't run into the zero floor. Outside that range
      // the config is degenerate (e.g. 6 high days + a huge surplus) and no
      // redistribution could preserve the total.
      if (lowDayCarbDrop(surplusCarbsG, highDays) > base.carbs_g) continue;
      it(`holds for ${highDays} high day(s), +${surplusCarbsG} g carbs`, () => {
        const c = cfg({ highDaysPerWeek: highDays, surplusCarbsG });
        let kcal = 0;
        let carbs = 0;
        let protein = 0;
        let fat = 0;
        for (let d = 0; d < WEEK_DAYS; d++) {
          const isHigh = d < highDays;
          const t = dayTarget(base, isHigh, c);
          kcal += t.kcal;
          carbs += t.carbs_g;
          protein += t.protein_g;
          fat += t.fat_g;
        }
        const flat = flatWeek(base);
        expect(kcal).toBeCloseTo(flat.kcal, 6);
        expect(carbs).toBeCloseTo(flat.carbs_g, 6);
        expect(protein).toBeCloseTo(flat.protein_g, 6);
        expect(fat).toBeCloseTo(flat.fat_g, 6);
      });
    }
  }
});

describe("weekly-total invariant with the CALCULATED surplus", () => {
  // The real feature: with the app-calculated surplus (no user input), a week of
  // high + low days still sums to seven flat days for kcal AND every macro,
  // across the whole safe count range.
  for (let highDays = HIGH_DAYS_SAFE_MIN; highDays <= HIGH_DAYS_SAFE_MAX; highDays++) {
    it(`holds for ${highDays} calculated high day(s)`, () => {
      const { surplusCarbsG } = computeSurplusCarbs(base, highDays);
      const c = cfg({ highDaysPerWeek: highDays, surplusCarbsG });
      let kcal = 0;
      let carbs = 0;
      let protein = 0;
      let fat = 0;
      for (let d = 0; d < WEEK_DAYS; d++) {
        const t = dayTarget(base, d < highDays, c);
        kcal += t.kcal;
        carbs += t.carbs_g;
        protein += t.protein_g;
        fat += t.fat_g;
      }
      expect(kcal).toBeCloseTo(base.kcal * WEEK_DAYS, 6);
      expect(carbs).toBeCloseTo(base.carbs_g * WEEK_DAYS, 6);
      expect(protein).toBeCloseTo(base.protein_g * WEEK_DAYS, 6);
      expect(fat).toBeCloseTo(base.fat_g * WEEK_DAYS, 6);
    });

    it(`makes high days bigger and low days smaller for ${highDays} high day(s)`, () => {
      const { surplusCarbsG } = computeSurplusCarbs(base, highDays);
      const c = cfg({ highDaysPerWeek: highDays, surplusCarbsG });
      const high = dayTarget(base, true, c);
      const low = dayTarget(base, false, c);
      // True refeed: energy up on a high day, down on a low day.
      expect(high.kcal).toBeGreaterThan(base.kcal);
      expect(low.kcal).toBeLessThan(base.kcal);
      // Only carbs move; protein and fat are identical every day.
      expect(high.protein_g).toBe(base.protein_g);
      expect(low.protein_g).toBe(base.protein_g);
      expect(high.fat_g).toBe(base.fat_g);
      expect(low.fat_g).toBe(base.fat_g);
    });
  }
});

describe("highDaysRemaining", () => {
  it("counts down the weekly allowance and never goes negative", () => {
    expect(highDaysRemaining(2, 0)).toBe(2);
    expect(highDaysRemaining(2, 1)).toBe(1);
    expect(highDaysRemaining(2, 2)).toBe(0);
    expect(highDaysRemaining(2, 5)).toBe(0); // over-taken still floors at 0
  });
});
