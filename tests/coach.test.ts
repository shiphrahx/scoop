import { describe, expect, it } from "vitest";
import {
  ageFromBirthYear,
  average,
  averageActiveKcal,
  bmr,
  bmrKatch,
  dailyTarget,
  deficitPerDay,
  macrosForKcal,
  proteinBasisKg,
  restingRate,
  tdee,
  tdeeFromComponents,
  trendChange,
  trendSeries,
  weeklyReview,
  type CoachInput,
  type Macros,
} from "@/lib/coach";

// Clinical heuristic: 1 kg of body fat ≈ 7700 kcal (≈ 3500 kcal/lb).
const KCAL_PER_KG = 7700;

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

describe("bmrKatch (Katch–McArdle)", () => {
  it("computes 370 + 21.6 × lean mass", () => {
    // 80 kg at 20% fat → 64 kg lean → 370 + 21.6*64 = 1752.4
    expect(bmrKatch(80, 20)).toBeCloseTo(1752.4, 5);
  });
});

describe("restingRate", () => {
  it("uses Katch–McArdle when body-fat % is given", () => {
    expect(
      restingRate({ sex: "male", weightKg: 80, heightCm: 180, age: 30, bodyFatPct: 20 }),
    ).toBeCloseTo(bmrKatch(80, 20), 5);
  });

  it("falls back to Mifflin when body-fat is missing or zero", () => {
    const mifflin = bmr("male", 80, 180, 30);
    expect(
      restingRate({ sex: "male", weightKg: 80, heightCm: 180, age: 30 }),
    ).toBeCloseTo(mifflin, 5);
    expect(
      restingRate({ sex: "male", weightKg: 80, heightCm: 180, age: 30, bodyFatPct: 0 }),
    ).toBeCloseTo(mifflin, 5);
  });
});

describe("tdee", () => {
  it("builds from the Katch–McArdle rate when body-fat is known", () => {
    const common = { sex: "male", diet: "regular", weightKg: 80, heightCm: 180, age: 30, activity: "moderate" } as const;
    expect(tdee({ ...common, bodyFatPct: 20 })).toBeCloseTo(bmrKatch(80, 20) * 1.55, 5);
  });

  it("multiplies BMR by the activity factor", () => {
    const base = bmr("male", 80, 180, 30);
    expect(tdee({ sex: "male", diet: "regular", weightKg: 80, heightCm: 180, age: 30, activity: "moderate" }))
      .toBeCloseTo(base * 1.55, 5);
  });

  it("sedentary is the lowest multiplier, very_active the highest", () => {
    const common = { sex: "female", diet: "regular", weightKg: 70, heightCm: 170, age: 40 } as const;
    expect(tdee({ ...common, activity: "sedentary" }))
      .toBeLessThan(tdee({ ...common, activity: "very_active" }));
  });

  it("puts measured active energy on the bare resting rate, plus TEF", () => {
    // Device "active energy" is everything burned above resting — all movement,
    // not just workouts. It must sit on RMR, not on an already-inflated 1.2
    // sedentary baseline, or everyday activity gets counted twice.
    const base = bmr("male", 80, 180, 30); // 1780
    expect(
      tdee({
        sex: "male",
        diet: "regular",
        weightKg: 80,
        heightCm: 180,
        age: 30,
        activity: "very_active",
        activeKcalPerDay: 500,
      }),
    ).toBeCloseTo((base + 500) / 0.9, 5); // 2533.3, not 1780*1.2+500 = 2636
  });

  it("does not double-count everyday movement", () => {
    // The old maths added the device burn on top of a 1.2 multiplier. That
    // overstated the day by ~0.2 × RMR — enough to eat most of a 0.5 kg/week
    // deficit. Guard the gap explicitly.
    const base = bmr("male", 80, 180, 30);
    const withDevice = tdee({
      sex: "male",
      diet: "regular",
      weightKg: 80,
      heightCm: 180,
      age: 30,
      activity: "moderate",
      activeKcalPerDay: 500,
    });
    expect(withDevice).toBeLessThan(base * 1.2 + 500);
  });

  it("ignores a zero or missing burn and falls back to the activity factor", () => {
    const common = {
      sex: "male",
      diet: "regular",
      weightKg: 80,
      heightCm: 180,
      age: 30,
      activity: "moderate",
    } as const;
    const fallback = bmr("male", 80, 180, 30) * 1.55;
    expect(tdee({ ...common, activeKcalPerDay: 0 })).toBeCloseTo(fallback, 5);
    expect(tdee({ ...common, activeKcalPerDay: null })).toBeCloseTo(fallback, 5);
    expect(tdee(common)).toBeCloseTo(fallback, 5);
  });
});

describe("tdeeFromComponents", () => {
  it("adds the thermic effect of food to resting + active", () => {
    // At maintenance intake == TDEE, so TDEE = (rmr + active) / (1 − 0.10).
    expect(tdeeFromComponents(1600, 500)).toBeCloseTo(2100 / 0.9, 5);
  });
});

describe("averageActiveKcal", () => {
  it("averages a well-covered week over the days that reported", () => {
    // 400+500+600+400+500+600+400 = 3400 over 7 reported days
    expect(averageActiveKcal([400, 500, 600, 400, 500, 600, 400], 7)).toBeCloseTo(
      485.714,
      3,
    );
  });

  it("tolerates a couple of gaps once coverage is met", () => {
    expect(averageActiveKcal([400, null, 600, 400, 500, null, 400], 7)).toBe(460);
  });

  it("refuses a part-synced week instead of extrapolating it", () => {
    // Three gym days out of seven averaged over three would read as a 600
    // kcal/day habit and roughly double the active half of TDEE. Better to
    // return null and let the activity multiplier answer.
    expect(averageActiveKcal([600, null, null, 600, null, null, 600], 7)).toBeNull();
    expect(averageActiveKcal([], 7)).toBeNull();
    expect(averageActiveKcal([null, null, null, null, null, null, null], 7)).toBeNull();
  });
});

describe("ageFromBirthYear", () => {
  it("subtracts birth year from the given year", () => {
    expect(ageFromBirthYear(1990, new Date("2026-07-10T00:00:00Z"))).toBe(36);
  });
});

describe("macrosForKcal", () => {
  // Expected values are written out, not recomputed from the source's own
  // formula — an assertion that re-derives the answer the same way the code does
  // can never catch the code changing.
  it("fixes protein at 2 g/kg and fat at a quarter of kcal", () => {
    const m = macrosForKcal(2000, 80);
    expect(m.protein_g).toBe(160); // 80 kg × 2 g/kg
    expect(m.fat_g).toBe(56); // 25% of 2000 kcal ÷ 9
    expect(m.carbs_g).toBe(214); // (2000 − 640 − 504) ÷ 4
    expect(m.kcal).toBe(2000);
  });

  it("sets the extra nutrient targets from the calorie total", () => {
    const m = macrosForKcal(2000, 80);
    expect(m.fiber_g).toBe(28); // 14 g per 1000 kcal
    expect(m.sugar_g).toBe(50); // 10% of kcal ÷ 4
    expect(m.satfat_g).toBe(22); // 10% of kcal ÷ 9
    expect(m.sodium_mg).toBe(2300); // flat daily limit
  });

  it("never returns negative carbs when protein+fat exceed kcal", () => {
    // A tiny calorie target with a heavy person: protein alone blows the budget.
    const m = macrosForKcal(400, 120);
    expect(m.carbs_g).toBe(0);
    expect(m.carbs_g).toBeGreaterThanOrEqual(0);
  });

  it("trims protein to fit the calories rather than overshooting them", () => {
    // 120 kg wants 240 g protein (960 kcal) — more than the whole 400 kcal
    // target. Prescribing it would tell the user to eat 1059 kcal of macros on a
    // 400 kcal day. Protein gives way instead: fat takes its 25% (11 g = 99
    // kcal), protein takes what's left (75 g = 300 kcal), carbs get nothing.
    const m = macrosForKcal(400, 120);
    expect(m.fat_g).toBe(11);
    expect(m.protein_g).toBe(75);
    expect(m.carbs_g).toBe(0);
    expect(m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9).toBeLessThanOrEqual(400);
  });

  it("leaves a normal target's protein untouched (the cap only bites when tight)", () => {
    // Room for the full 2 g/kg here, so nothing is trimmed.
    expect(macrosForKcal(2000, 80).protein_g).toBe(160);
  });

  it("rounds kcal", () => {
    expect(macrosForKcal(1999.6, 70).kcal).toBe(2000);
  });

  it("caps protein at the healthy-weight basis when a height is given", () => {
    // 120 kg at 170 cm: BMI-25 weight is 25 × 1.7² ≈ 72.25 kg, so protein is set
    // from that (144 g), not the full 120 kg (240 g).
    expect(macrosForKcal(2000, 120, "regular", 170).protein_g).toBe(144);
    expect(macrosForKcal(2000, 120).protein_g).toBe(240);
  });

  it("does not raise protein for someone already at a healthy weight", () => {
    // 65 kg at 175 cm is below the BMI-25 cap (76.6 kg) → basis is bodyweight.
    const m = macrosForKcal(2000, 65, "regular", 175);
    expect(m.protein_g).toBe(130); // 65 * 2, uncapped
  });

  it("leaves protein on bodyweight when no height is supplied", () => {
    expect(macrosForKcal(2000, 120).protein_g).toBe(240); // 120 * 2
  });

  it("pins carbs to the keto ceiling and pours the rest into fat", () => {
    const m = macrosForKcal(2000, 80, "keto");
    expect(m.protein_g).toBe(160); // 80 × 2, unchanged
    expect(m.carbs_g).toBe(25); // hard keto carb ceiling
    expect(m.fat_g).toBe(140); // (2000 − 640 − 100) ÷ 9
    // and it really is a low-carb, high-fat split vs the regular one
    expect(m.carbs_g).toBeLessThan(macrosForKcal(2000, 80).carbs_g);
    expect(m.fat_g).toBeGreaterThan(macrosForKcal(2000, 80).fat_g);
  });
});

describe("proteinBasisKg", () => {
  it("returns bodyweight when no height is given", () => {
    expect(proteinBasisKg(120)).toBe(120);
  });

  it("caps at the BMI-25 weight for the height", () => {
    expect(proteinBasisKg(120, 170)).toBeCloseTo(25 * 1.7 ** 2, 5); // 72.25
  });

  it("keeps bodyweight when it is under the healthy cap", () => {
    expect(proteinBasisKg(65, 175)).toBe(65);
  });

  it("prefers an explicit goal weight over the BMI-25 proxy", () => {
    // Goal 80 kg wins over the BMI-25 weight (72.25); capped at min(120, 80).
    expect(proteinBasisKg(120, 170, 80)).toBe(80);
  });

  it("never caps above current weight even with a higher goal", () => {
    expect(proteinBasisKg(120, 170, 130)).toBe(120);
  });

  it("uses the goal weight even when no height is given", () => {
    expect(proteinBasisKg(120, undefined, 85)).toBe(85);
  });
});

describe("deficitPerDay", () => {
  it("derives the deficit from the target rate (kg/week × 7700 ÷ 7)", () => {
    // 0.5 kg/week is well under the 1% cap for an 80 kg person (0.8 kg/week).
    expect(deficitPerDay("steady", 80)).toBeCloseTo((0.5 * KCAL_PER_KG) / 7, 5);
    expect(deficitPerDay("gentle", 80)).toBeCloseTo((0.25 * KCAL_PER_KG) / 7, 5);
    expect(deficitPerDay("aggressive", 80)).toBeCloseTo(
      (0.75 * KCAL_PER_KG) / 7,
      5,
    );
  });

  it("caps the loss rate at 1% of bodyweight/week", () => {
    // A 55 kg person's cap is 0.55 kg/week, below the 0.75 kg/week "aggressive".
    expect(deficitPerDay("aggressive", 55)).toBeCloseTo(
      (0.55 * KCAL_PER_KG) / 7,
      5,
    );
    // The cap only bites when the pace exceeds it — 0.25 kg/week stays as-is.
    expect(deficitPerDay("gentle", 55)).toBeCloseTo((0.25 * KCAL_PER_KG) / 7, 5);
  });
});

describe("dailyTarget", () => {
  const base: CoachInput = {
    sex: "male",
    diet: "regular",
    weightKg: 90,
    heightCm: 185,
    age: 35,
    activity: "moderate",
    pace: "steady",
  };

  it("subtracts the rate-derived deficit from maintenance", () => {
    const maintenance = tdee(base);
    // 0.5 kg/week is under 90 kg's 0.9 kg/week cap, so the full rate applies.
    const expected = Math.round(maintenance - (0.5 * KCAL_PER_KG) / 7);
    expect(dailyTarget(base).kcal).toBe(expected);
  });

  it("delivers the promised loss rate for a mid-size user", () => {
    // The kcal gap, spread over a week, should equal the labelled 0.5 kg.
    const maintenance = tdee(base);
    const weeklyDeficit = (maintenance - dailyTarget(base).kcal) * 7;
    expect(weeklyDeficit / KCAL_PER_KG).toBeCloseTo(0.5, 2);
  });

  it("never drops below the female safety floor of 1200", () => {
    const t = dailyTarget({
      sex: "female",
      diet: "regular",
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
      diet: "regular",
      weightKg: 50,
      heightCm: 155,
      age: 80,
      activity: "sedentary",
      pace: "aggressive",
    });
    expect(t.kcal).toBeGreaterThanOrEqual(1500);
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

describe("trendSeries / trendChange", () => {
  // Build a run of consecutive daily weigh-ins starting 2026-01-01.
  const run = (kgs: (number | null)[]) =>
    kgs.flatMap((kg, i) =>
      kg == null
        ? []
        : [{ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), kg }],
    );

  it("returns nothing for an empty history", () => {
    expect(trendSeries([])).toEqual([]);
    expect(trendChange([])).toBeNull();
  });

  it("seeds on the first weigh-in and holds a flat weight flat", () => {
    const s = trendSeries(run(Array(10).fill(80)));
    expect(s).toHaveLength(10);
    expect(s[0].kg).toBe(80);
    expect(s[9].kg).toBeCloseTo(80, 6);
  });

  it("moves only a fraction of the way towards a one-day spike", () => {
    // 80 kg for a week then a 2 kg water day. A 7-day mean would swallow ~0.3 kg
    // of that; the trend takes a tenth of the surprise, ~0.2 kg.
    const s = trendSeries(run([80, 80, 80, 80, 80, 80, 82]));
    expect(s[6].kg).toBeCloseTo(80.2, 6);
    expect(s[6].kg).toBeLessThan(80.5);
  });

  it("carries the trend across days with no weigh-in", () => {
    const s = trendSeries(run([80, null, null, 80]));
    expect(s).toHaveLength(4);
    expect(s[1].kg).toBe(s[0].kg);
    expect(s[2].kg).toBe(s[0].kg);
  });

  it("recovers the true weekly rate from a steady linear loss", () => {
    // 0.1 kg/day for 60 days = 0.7 kg/week. The trend's LEVEL lags the scale by
    // about nine days, but its slope is unbiased — and slope is what the review
    // acts on.
    const kgs = Array.from({ length: 60 }, (_, i) => 100 - i * 0.1);
    const c = trendChange(run(kgs));
    expect(c).not.toBeNull();
    expect(c!.changeKg).toBeCloseTo(0.7, 1);
    expect(c!.changePct).toBeCloseTo(0.7 / c!.thenKg, 3);
    expect(c!.spanDays).toBe(7);
  });

  it("is steadier than week-mean vs week-mean on noisy data", () => {
    // A flat 80 kg carrying alternating +/-1 kg of water noise. True change is
    // zero; both estimators report some artefact, but the naive one reports a
    // much bigger one because a 7-day window catches four of one day and three
    // of the other, and that split flips every week.
    const noisy = Array.from({ length: 40 }, (_, i) => 80 + (i % 2 === 0 ? 1 : -1));

    const naive =
      average(noisy.slice(-14, -7))! - average(noisy.slice(-7))!;
    const trend = trendChange(run(noisy))!.changeKg;

    expect(Math.abs(trend)).toBeLessThan(Math.abs(naive) / 2);
    expect(Math.abs(trend)).toBeLessThan(0.15);
  });

  it("refuses to report a rate it cannot span", () => {
    // Three days of history cannot describe a seven-day change. Comparing the
    // trend against its own seed would report a flat week and trigger a cut.
    expect(trendChange(run([80, 79.8, 79.6]))).toBeNull();
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

  it("holds instead of dividing by a zero weight", () => {
    // getCoachData falls back to 0 when a week has no weigh-ins. Zero isn't a
    // weight — treating it as one makes the loss rate infinite, which used to
    // read as "losing too fast" and ADD calories.
    for (const weights of [
      { thisWeekAvgKg: 90, lastWeekAvgKg: 0 },
      { thisWeekAvgKg: 0, lastWeekAvgKg: 90 },
    ]) {
      const r = weeklyReview({
        sex: "male",
        ...weights,
        waistDeltaCm: null,
        current,
        weeksOnTarget: 4,
        consistent: true,
      });
      expect(r.changed).toBe(false);
      expect(r.macros).toEqual(current);
      expect(r.changePct).toBeNull();
    }
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

  it("treats both edges of the healthy band as healthy", () => {
    // Exactly 0.5% (the floor) and exactly 1.0% (the ceiling) are inside the
    // band — the comparisons are >= and <=, and an off-by-one here would either
    // cut a user who is doing fine or leave one who is dropping too fast.
    for (const thisWeekAvgKg of [99.5, 99]) {
      const r = weeklyReview({
        sex: "male",
        thisWeekAvgKg,
        lastWeekAvgKg: 100,
        waistDeltaCm: null,
        current,
      });
      expect(r.changed).toBe(false);
      expect(r.macros).toEqual(current);
    }
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

describe("weeklyReview cadence gates", () => {
  const current: Macros = { kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 56 };
  // A stall that WOULD trigger a cut once the gates are open.
  const stall = {
    sex: "male" as const,
    thisWeekAvgKg: 90,
    lastWeekAvgKg: 90,
    waistDeltaCm: 0,
    current,
  };

  it("holds a stalled target that is still new (under 2 weeks)", () => {
    const r = weeklyReview({ ...stall, weeksOnTarget: 1, consistent: true });
    expect(r.changed).toBe(false);
    expect(r.macros).toEqual(current);
    expect(r.headline).toMatch(/settling/i);
  });

  it("holds when weigh-ins are inconsistent, even after 2 weeks", () => {
    const r = weeklyReview({ ...stall, weeksOnTarget: 3, consistent: false });
    expect(r.changed).toBe(false);
    expect(r.macros).toEqual(current);
    expect(r.headline).toMatch(/fuller/i);
  });

  it("adjusts once the target is ≥2 weeks old and logging is consistent", () => {
    const r = weeklyReview({ ...stall, weeksOnTarget: 2, consistent: true });
    expect(r.changed).toBe(true);
    expect(r.macros.kcal).toBeLessThan(current.kcal);
  });

  it("also holds a too-fast loss while the target is new (one noisy week)", () => {
    // 90 → 88 = 2.2%/week: normally an add, but one week isn't enough to act.
    const r = weeklyReview({
      sex: "male",
      thisWeekAvgKg: 88,
      lastWeekAvgKg: 90,
      waistDeltaCm: null,
      current,
      weeksOnTarget: 1,
      consistent: true,
    });
    expect(r.changed).toBe(false);
    expect(r.headline).toMatch(/settling/i);
  });
});
