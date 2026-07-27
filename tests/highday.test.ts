import { describe, expect, it } from "vitest";
import {
  HIGH_DAYS_BY_PACE,
  HIGH_DAYS_SAFE_MAX,
  HIGH_DAYS_SAFE_MIN,
  MAINTENANCE_HIGH_DAYS,
  REFEED_DAYS_DEFAULT,
  WEEK_DAYS,
  clampHighDaysChoice,
  cycleConfigFrom,
  dayTarget,
  effectiveHighDays,
  expectedWeeklyLossKg,
  highDaysRemaining,
  recommendedHighDays,
  refeedCarbUpliftG,
  resolveHighDaysAllowance,
  weeklyDeficitKcal,
  type CycleConfig,
} from "@/lib/highday";
import type { Macros } from "@/lib/types";

// A flat deficit daily target. Maintenance sits 500 kcal above it.
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
const MAINTENANCE = 2500;

const cfg = (over: Partial<CycleConfig> = {}): CycleConfig => ({
  enabled: true,
  refeedDaysPerWeek: 2,
  maintenanceKcal: MAINTENANCE,
  ...over,
});

describe("recommendedHighDays", () => {
  it("defaults every deficit pace to the evidence-based two", () => {
    expect(recommendedHighDays("aggressive")).toBe(REFEED_DAYS_DEFAULT);
    expect(recommendedHighDays("steady")).toBe(REFEED_DAYS_DEFAULT);
    expect(recommendedHighDays("gentle")).toBe(REFEED_DAYS_DEFAULT);
    expect(REFEED_DAYS_DEFAULT).toBe(2);
  });

  it("gives maintenance the top of the range", () => {
    expect(recommendedHighDays("steady", "maintenance")).toBe(MAINTENANCE_HIGH_DAYS);
  });

  it("offers no refeed days during calibration", () => {
    expect(recommendedHighDays("steady", "calibration")).toBe(0);
    expect(recommendedHighDays("gentle", "calibration")).toBe(0);
  });
});

describe("calibration blocks refeeds (macros fixed)", () => {
  const profile = { cycling_enabled: true, high_days_per_week: 3, goal_pace: "steady" as const };

  it("disables cycling and offers no ceiling during calibration", () => {
    const c = cycleConfigFrom(profile, "calibration", MAINTENANCE);
    expect(c.enabled).toBe(false);
    expect(c.refeedDaysPerWeek).toBe(0);
    expect(c.maintenanceKcal).toBeNull();
  });

  it("leaves every day at the fixed target even if a day is flagged high", () => {
    const c = cycleConfigFrom(profile, "calibration", MAINTENANCE);
    expect(dayTarget(base, true, c)).toEqual(base);
    expect(dayTarget(base, false, c)).toEqual(base);
  });
});

describe("refeeds need a confident maintenance estimate", () => {
  const profile = { cycling_enabled: true, high_days_per_week: 2, goal_pace: "steady" as const };

  it("stays off until maintenance is known", () => {
    expect(cycleConfigFrom(profile, "deficit", null).enabled).toBe(false);
    expect(cycleConfigFrom(profile, "deficit", 0).enabled).toBe(false);
    expect(cycleConfigFrom(profile, "deficit", MAINTENANCE).enabled).toBe(true);
  });

  it("applies no uplift with no maintenance, even on a flagged day", () => {
    const c = cycleConfigFrom(profile, "deficit", null);
    expect(dayTarget(base, true, c)).toEqual(base);
  });
});

describe("dayTarget — free refeed at maintenance", () => {
  it("raises a refeed day up to maintenance with carbs only", () => {
    const day = dayTarget(base, true, cfg());
    // The whole 500 kcal gap becomes carbs: 500 / 4 = 125 g.
    expect(day.kcal).toBe(MAINTENANCE);
    expect(day.carbs_g).toBe(base.carbs_g + 125);
  });

  it("never exceeds maintenance", () => {
    const day = dayTarget(base, true, cfg());
    expect(day.kcal).toBeLessThanOrEqual(MAINTENANCE);
  });

  it("holds protein and fat constant on a refeed day", () => {
    const day = dayTarget(base, true, cfg());
    expect(day.protein_g).toBe(base.protein_g);
    expect(day.fat_g).toBe(base.fat_g);
  });

  it("leaves a deficit day exactly unchanged", () => {
    expect(dayTarget(base, false, cfg())).toEqual(base);
  });

  it("does not borrow: a deficit day is identical whatever the refeed count", () => {
    expect(dayTarget(base, false, cfg({ refeedDaysPerWeek: 1 }))).toEqual(base);
    expect(dayTarget(base, false, cfg({ refeedDaysPerWeek: 3 }))).toEqual(base);
  });

  it("returns the flat target when cycling is off", () => {
    expect(dayTarget(base, true, cfg({ enabled: false }))).toEqual(base);
  });

  it("adds nothing when the base already meets maintenance", () => {
    const atMaintenance = { ...base, kcal: MAINTENANCE };
    expect(dayTarget(atMaintenance, true, cfg())).toEqual(atMaintenance);
  });
});

describe("refeedCarbUpliftG", () => {
  it("is the whole gap up to maintenance, in grams of carbs", () => {
    expect(refeedCarbUpliftG(base, cfg())).toBe(125);
  });

  it("is zero when cycling is off, maintenance is unknown, or base is already at it", () => {
    expect(refeedCarbUpliftG(base, cfg({ enabled: false }))).toBe(0);
    expect(refeedCarbUpliftG(base, cfg({ maintenanceKcal: null }))).toBe(0);
    expect(refeedCarbUpliftG({ ...base, kcal: MAINTENANCE }, cfg())).toBe(0);
  });
});

describe("effectiveHighDays", () => {
  it("clamps to a range that always leaves one low day", () => {
    expect(effectiveHighDays(-1)).toBe(0);
    expect(effectiveHighDays(WEEK_DAYS)).toBe(WEEK_DAYS - 1);
    expect(effectiveHighDays(2)).toBe(2);
  });
});

describe("clampHighDaysChoice", () => {
  it("holds the user's count inside the safe adjustable range", () => {
    expect(clampHighDaysChoice(0)).toBe(HIGH_DAYS_SAFE_MIN);
    expect(clampHighDaysChoice(99)).toBe(HIGH_DAYS_SAFE_MAX);
    expect(clampHighDaysChoice(2)).toBe(2);
    expect(HIGH_DAYS_SAFE_MAX).toBe(3);
  });
});

describe("resolveHighDaysAllowance", () => {
  it("uses the user's chosen count when set", () => {
    const p = { cycling_enabled: true, high_days_per_week: 3, goal_pace: "steady" as const };
    expect(resolveHighDaysAllowance(p, "deficit")).toBe(3);
  });

  it("falls back to the recommendation when the user hasn't chosen", () => {
    const p = { cycling_enabled: true, high_days_per_week: null, goal_pace: "steady" as const };
    expect(resolveHighDaysAllowance(p, "deficit")).toBe(REFEED_DAYS_DEFAULT);
  });

  it("is zero during calibration", () => {
    const p = { cycling_enabled: true, high_days_per_week: 3, goal_pace: "steady" as const };
    expect(resolveHighDaysAllowance(p, "calibration")).toBe(0);
  });

  it("still maps a pace to the evidence-based default", () => {
    expect(HIGH_DAYS_BY_PACE.aggressive).toBe(REFEED_DAYS_DEFAULT);
  });
});

describe("highDaysRemaining", () => {
  it("counts down the weekly count and never goes negative", () => {
    expect(highDaysRemaining(2, 0)).toBe(2);
    expect(highDaysRemaining(2, 1)).toBe(1);
    expect(highDaysRemaining(2, 2)).toBe(0);
    expect(highDaysRemaining(2, 5)).toBe(0);
  });
});

describe("weekly effect is honestly smaller on refeed weeks", () => {
  it("a refeed week eats more than seven deficit days (deficit shrinks)", () => {
    const refeeds = 2;
    const week =
      refeeds * dayTarget(base, true, cfg()).kcal +
      (WEEK_DAYS - refeeds) * dayTarget(base, false, cfg()).kcal;
    const flatWeek = WEEK_DAYS * base.kcal;
    // Free refeeds add calories back — the week is NOT calorie-neutral.
    expect(week).toBeGreaterThan(flatWeek);
    // And the extra is exactly the uplift on each refeed day (nothing borrowed).
    expect(week - flatWeek).toBe(refeeds * refeedCarbUpliftG(base, cfg()) * 4);
  });

  it("weeklyDeficitKcal drops one daily deficit per refeed day", () => {
    const daily = MAINTENANCE - base.kcal; // 500
    expect(weeklyDeficitKcal(daily, 0)).toBe(daily * 7);
    expect(weeklyDeficitKcal(daily, 2)).toBe(daily * 5);
    expect(weeklyDeficitKcal(daily, 2)).toBeLessThan(weeklyDeficitKcal(daily, 0));
  });

  it("projects a correspondingly smaller weekly loss on refeed weeks", () => {
    const daily = MAINTENANCE - base.kcal;
    const flat = expectedWeeklyLossKg(weeklyDeficitKcal(daily, 0));
    const withRefeeds = expectedWeeklyLossKg(weeklyDeficitKcal(daily, 2));
    expect(withRefeeds).toBeLessThan(flat);
    expect(withRefeeds).toBeCloseTo((daily * 5) / 7700, 5);
  });
});
