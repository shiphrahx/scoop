import { describe, expect, it } from "vitest";
import {
  ageFromBirthYear,
  average,
  bmr,
  dailyTarget,
  macrosForKcal,
  tdee,
  weekStart,
  weeklyReview,
  type CoachInput,
  type Macros,
} from "@/lib/coach";

describe("bmr (Mifflin–St Jeor)", () => {
  it("adds 5 for men", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(bmr("male", 80, 180, 30)).toBe(1780);
  });

  it("subtracts 161 for women", () => {
    // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25
    expect(bmr("female", 60, 165, 30)).toBeCloseTo(1320.25, 2);
  });
});

describe("tdee", () => {
  it("multiplies BMR by the activity factor", () => {
    const base = bmr("male", 80, 180, 30);
    expect(tdee({ sex: "male", weightKg: 80, heightCm: 180, age: 30, activity: "moderate" }))
      .toBeCloseTo(base * 1.55, 5);
  });

  it("sedentary is the lowest multiplier, very_active the highest", () => {
    const common = { sex: "female", weightKg: 70, heightCm: 170, age: 40 } as const;
    expect(tdee({ ...common, activity: "sedentary" }))
      .toBeLessThan(tdee({ ...common, activity: "very_active" }));
  });
});

describe("ageFromBirthYear", () => {
  it("subtracts birth year from the given year", () => {
    expect(ageFromBirthYear(1990, new Date("2026-07-10T00:00:00Z"))).toBe(36);
  });
});

describe("macrosForKcal", () => {
  it("fixes protein at 2 g/kg and fat at a quarter of kcal", () => {
    const m = macrosForKcal(2000, 80);
    expect(m.protein_g).toBe(160); // 80 * 2
    expect(m.fat_g).toBe(Math.round((2000 * 0.25) / 9)); // 56
    // carbs is the remainder of kcal after protein (×4) and fat (×9)
    expect(m.carbs_g).toBe(Math.round((2000 - 160 * 4 - 56 * 9) / 4));
    expect(m.kcal).toBe(2000);
  });

  it("never returns negative carbs when protein+fat exceed kcal", () => {
    // A tiny calorie target with a heavy person: protein alone blows the budget.
    const m = macrosForKcal(400, 120);
    expect(m.carbs_g).toBe(0);
    expect(m.carbs_g).toBeGreaterThanOrEqual(0);
  });

  it("rounds kcal", () => {
    expect(macrosForKcal(1999.6, 70).kcal).toBe(2000);
  });
});

describe("dailyTarget", () => {
  const base: CoachInput = {
    sex: "male",
    weightKg: 90,
    heightCm: 185,
    age: 35,
    activity: "moderate",
    pace: "steady",
  };

  it("applies the pace deficit to maintenance", () => {
    const maintenance = tdee(base);
    expect(dailyTarget(base).kcal).toBe(Math.round(maintenance * 0.8));
  });

  it("never drops below the female safety floor of 1200", () => {
    const t = dailyTarget({
      sex: "female",
      weightKg: 45,
      heightCm: 150,
      age: 70,
      activity: "sedentary",
      pace: "aggressive",
    });
    expect(t.kcal).toBeGreaterThanOrEqual(1200);
  });

  it("never drops below the male safety floor of 1500", () => {
    const t = dailyTarget({
      sex: "male",
      weightKg: 50,
      heightCm: 155,
      age: 80,
      activity: "sedentary",
      pace: "aggressive",
    });
    expect(t.kcal).toBeGreaterThanOrEqual(1500);
  });
});

describe("weekStart", () => {
  it("returns the Monday of a mid-week date", () => {
    // 2026-07-10 is a Friday → Monday is 2026-07-06
    expect(weekStart(new Date("2026-07-10T12:00:00Z"))).toBe("2026-07-06");
  });

  it("maps a Sunday back to the previous Monday (not forward)", () => {
    // 2026-07-12 is a Sunday → Monday is 2026-07-06
    expect(weekStart(new Date("2026-07-12T12:00:00Z"))).toBe("2026-07-06");
  });

  it("returns the same day when the date is already a Monday", () => {
    expect(weekStart(new Date("2026-07-06T00:00:00Z"))).toBe("2026-07-06");
  });
});

describe("average", () => {
  it("returns null for an empty list", () => {
    expect(average([])).toBeNull();
  });

  it("computes the plain mean", () => {
    expect(average([80, 82, 84])).toBe(82);
  });

  it("handles a single value", () => {
    expect(average([73.5])).toBe(73.5);
  });
});

describe("weeklyReview", () => {
  const current: Macros = { kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 56 };

  it("holds and asks for more data when there is no prior week", () => {
    const r = weeklyReview({
      sex: "male",
      thisWeekAvgKg: 90,
      lastWeekAvgKg: null,
      waistDeltaCm: null,
      current,
    });
    expect(r.changed).toBe(false);
    expect(r.macros).toEqual(current);
    expect(r.changeKg).toBeNull();
  });

  it("keeps macros on a healthy 0.5–1% weekly loss", () => {
    // 90 → 89.4 kg = 0.6667% loss (inside the band)
    const r = weeklyReview({
      sex: "male",
      thisWeekAvgKg: 89.4,
      lastWeekAvgKg: 90,
      waistDeltaCm: null,
      current,
    });
    expect(r.changed).toBe(false);
    expect(r.macros).toEqual(current);
    expect(r.changeKg).toBeCloseTo(0.6, 5);
  });

  it("adds calories when losing too fast", () => {
    // 90 → 88 = 2.2% loss, well over the 1% cap
    const r = weeklyReview({
      sex: "male",
      thisWeekAvgKg: 88,
      lastWeekAvgKg: 90,
      waistDeltaCm: null,
      current,
    });
    expect(r.changed).toBe(true);
    expect(r.macros.kcal).toBe(Math.round(2000 * 1.05));
    expect(r.macros.kcal).toBeGreaterThan(current.kcal);
  });

  it("holds when the scale is flat but the waist is down", () => {
    const r = weeklyReview({
      sex: "male",
      thisWeekAvgKg: 89.98, // ~0.02% — below the healthy floor (a stall)
      lastWeekAvgKg: 90,
      waistDeltaCm: -1.0,
      current,
    });
    expect(r.changed).toBe(false);
    expect(r.macros).toEqual(current);
    expect(r.headline).toMatch(/waist/i);
  });

  it("trims calories on a plateau with no waist progress", () => {
    const r = weeklyReview({
      sex: "male",
      thisWeekAvgKg: 90,
      lastWeekAvgKg: 90,
      waistDeltaCm: 0,
      current,
    });
    expect(r.changed).toBe(true);
    expect(r.macros.kcal).toBe(Math.round(2000 * 0.93));
    expect(r.macros.kcal).toBeLessThan(current.kcal);
  });

  it("trims calories when weight went up", () => {
    const r = weeklyReview({
      sex: "male",
      thisWeekAvgKg: 91,
      lastWeekAvgKg: 90,
      waistDeltaCm: null,
      current,
    });
    expect(r.changed).toBe(true);
    expect(r.macros.kcal).toBeLessThan(current.kcal);
    expect(r.headline).toMatch(/up/i);
  });

  it("does not cut below the safety floor when already at it", () => {
    const atFloor: Macros = { kcal: 1500, protein_g: 160, carbs_g: 90, fat_g: 42 };
    const r = weeklyReview({
      sex: "male",
      thisWeekAvgKg: 90,
      lastWeekAvgKg: 90,
      waistDeltaCm: 0,
      current: atFloor,
    });
    expect(r.changed).toBe(false);
    expect(r.macros.kcal).toBe(1500);
    expect(r.headline).toMatch(/floor/i);
  });
});
