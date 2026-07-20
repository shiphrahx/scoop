import { describe, expect, it } from "vitest";
import {
  ageFromBirthYear,
  adherence,
  average,
  averageActiveKcal,
  bmr,
  bmrKatch,
  dailyTarget,
  healthyLossBand,
  kcalFloor,
  deficitPerDay,
  macrosForKcal,
  nextPhase,
  observeTdee,
  proteinBasisKg,
  tdeeFromEnergyBalance,
  updateCalibration,
  restingRate,
  stepKcal,
  stepsFalling,
  tdee,
  tdeeFromComponents,
  trendChange,
  weightSlopeKgPerDay,
  trendSeries,
  weeklyReview,
  type CoachInput,
  type Adherence,
  type Macros,
  type TrendChange,
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
    expect(m.carbs_g).toBeGreaterThanOrEqual(0);
  });

  it("trims protein to fit the calories rather than overshooting them", () => {
    // 120 kg wants 240 g protein (960 kcal) — more than the whole 400 kcal
    // target. Prescribing it would tell the user to eat 1059 kcal of macros on a
    // 400 kcal day. Protein gives way instead.
    //
    // Fat does not: it takes the hormone floor first, capped at 40% of the day
    // (17 g here), and protein takes what's left. 25% of 400 kcal would have
    // been 11 g of fat, which is below what anyone should eat.
    const m = macrosForKcal(400, 120);
    expect(m.fat_g).toBe(17);
    expect(m.protein_g).toBe(61);
    expect(m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9).toBeLessThanOrEqual(405);
  });

  it("keeps fat above the hormone floor on a small target", () => {
    // 0.6 g/kg is the point below which sex-hormone production and fat-soluble
    // vitamin absorption start to suffer. A percentage rule alone doesn't
    // protect it: 25% of a 1200 kcal day is 33 g.
    const m = macrosForKcal(1200, 70);
    expect(m.fat_g).toBeGreaterThanOrEqual(42); // 70 kg x 0.6
  });

  it("does not let keto squeeze the fat out of a ketogenic diet", () => {
    // Fat is the remainder on keto, so a heavy user on a small target could be
    // handed a "keto" split with almost no fat in it. Protein yields instead.
    const m = macrosForKcal(1400, 110, "keto");
    expect(m.carbs_g).toBe(25);
    expect(m.fat_g).toBeGreaterThanOrEqual(60);
    expect(m.protein_g).toBeGreaterThan(0);
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

describe("healthyLossBand", () => {
  it("slows a lean user down", () => {
    // 1%/week at 12% body fat is a prescription for losing muscle: the leaner
    // you are, the less of a deficit fat can actually supply.
    const lean = healthyLossBand("male", 12);
    const ample = healthyLossBand("male", 32);
    expect(lean.max).toBeLessThan(ample.max);
    expect(lean.max).toBe(0.005);
    expect(ample.max).toBe(0.01);
  });

  it("moves the thresholds up for women, who carry more essential fat", () => {
    // 22% is lean for a woman and ample for a man.
    expect(healthyLossBand("female", 22).max).toBeLessThan(
      healthyLossBand("male", 22).max,
    );
  });

  it("keeps the old flat band when body fat is unknown", () => {
    expect(healthyLossBand("male", null)).toEqual({ min: 0.005, max: 0.01 });
  });
});

describe("kcalFloor", () => {
  it("never sends anyone below their own resting metabolism", () => {
    // A flat 1200 for a 100 kg woman whose RMR is 1650 is a >50% deficit.
    expect(kcalFloor("female", 1650)).toBe(1650);
  });

  it("keeps the absolute floor when resting rate is lower or unknown", () => {
    expect(kcalFloor("female", 1100)).toBe(1200);
    expect(kcalFloor("male", null)).toBe(1500);
  });
});

describe("deficit caps", () => {
  it("never takes more than 30% of maintenance", () => {
    // A heavy, sedentary, older user: 1% of bodyweight a week is a large
    // number of calories against a small burn.
    const t = dailyTarget({
      sex: "female",
      diet: "regular",
      weightKg: 130,
      heightCm: 155,
      age: 65,
      activity: "sedentary",
      pace: "aggressive",
    });
    const maintenance = tdee({
      sex: "female",
      diet: "regular",
      weightKg: 130,
      heightCm: 155,
      age: 65,
      activity: "sedentary",
    });
    expect(t.kcal).toBeGreaterThanOrEqual(maintenance * 0.7 - 1);
  });

  it("holds a lean user to the slower band even on an aggressive pace", () => {
    const leanTarget = dailyTarget({
      sex: "male",
      diet: "regular",
      weightKg: 80,
      heightCm: 180,
      age: 30,
      activity: "moderate",
      pace: "aggressive",
      bodyFatPct: 10,
    });
    const softTarget = dailyTarget({
      sex: "male",
      diet: "regular",
      weightKg: 80,
      heightCm: 180,
      age: 30,
      activity: "moderate",
      pace: "aggressive",
      bodyFatPct: 30,
    });
    // Same person, same pace: the lean one is allowed a smaller deficit, so
    // eats more. (Body fat also changes the resting-rate equation, so compare
    // the deficit rather than the raw target.)
    const leanMaint = tdee({
      sex: "male", diet: "regular", weightKg: 80, heightCm: 180, age: 30,
      activity: "moderate", bodyFatPct: 10,
    });
    const softMaint = tdee({
      sex: "male", diet: "regular", weightKg: 80, heightCm: 180, age: 30,
      activity: "moderate", bodyFatPct: 30,
    });
    expect(leanMaint - leanTarget.kcal).toBeLessThan(softMaint - softTarget.kcal);
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

describe("observeTdee", () => {
  const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
  // A run of daily weigh-ins and a matching run of daily food logs.
  const weighIns = (kgs: number[]) => kgs.map((kg, i) => ({ date: day(i), kg }));
  const intake = (n: number, kcal: number, from = 0) =>
    Array.from({ length: n }, (_, i) => ({ date: day(from + i), kcal }));

  it("solves the energy balance equation", () => {
    // Ate 2000 kcal/day and lost 1 kg over 27 days. 1 kg is 7700 kcal, so the
    // burn was 2000 + 7700/27 = 2285 kcal/day.
    expect(tdeeFromEnergyBalance(2000, 1, 27)).toBeCloseTo(2000 + 7700 / 27, 5);
  });

  it("recovers a burn the formula would have missed", () => {
    // 28 days eating a logged 2000 kcal while losing 0.25 kg/week — a real
    // maintenance of roughly 2275 kcal, whatever Mifflin thinks of this person.
    const kgs = Array.from({ length: 28 }, (_, i) => 90 - i * (0.25 / 7));
    const o = observeTdee(weighIns(kgs), intake(28, 2000));
    expect(o).not.toBeNull();
    expect(o!.kcalPerDay).toBeGreaterThan(2200);
    expect(o!.kcalPerDay).toBeLessThan(2350);
    expect(o!.meanIntakeKcal).toBe(2000);
  });

  it("reads a gain as a burn below intake", () => {
    const kgs = Array.from({ length: 28 }, (_, i) => 90 + i * (0.25 / 7));
    const o = observeTdee(weighIns(kgs), intake(28, 2500));
    expect(o!.kcalPerDay).toBeLessThan(2500);
    expect(o!.trendDeltaKg).toBeLessThan(0);
  });

  it("refuses a window shorter than a fortnight", () => {
    const kgs = Array.from({ length: 10 }, (_, i) => 90 - i * 0.03);
    expect(observeTdee(weighIns(kgs), intake(10, 2000))).toBeNull();
  });

  it("refuses when too few days carry a food log", () => {
    // Logging 12 of 28 days and averaging those is a biased sample: the days a
    // user skips logging are the big ones. Believing it would read as a low
    // intake, make the measured burn look small, and cut the target.
    const kgs = Array.from({ length: 28 }, (_, i) => 90 - i * 0.03);
    expect(observeTdee(weighIns(kgs), intake(12, 2000))).toBeNull();
  });

  it("ignores intake logged outside the weigh-in window", () => {
    // The weight term and the intake term must describe the same stretch of
    // time or the arithmetic means nothing.
    const kgs = Array.from({ length: 28 }, (_, i) => 90 - i * 0.03);
    const stale = intake(28, 9999, 400); // a year later
    expect(observeTdee(weighIns(kgs), stale)).toBeNull();
  });
});

describe("weightSlopeKgPerDay", () => {
  const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);

  it("recovers the slope of a clean line", () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ date: day(i), kg: 90 - i * 0.05 }));
    expect(weightSlopeKgPerDay(pts)).toBeCloseTo(-0.05, 6);
  });

  it("handles ragged spacing — real logging has gaps", () => {
    const pts = [0, 3, 4, 9, 15, 16, 27].map((i) => ({ date: day(i), kg: 90 - i * 0.05 }));
    expect(weightSlopeKgPerDay(pts)).toBeCloseTo(-0.05, 6);
  });

  it("reports nothing it cannot draw a line through", () => {
    expect(weightSlopeKgPerDay([])).toBeNull();
    expect(weightSlopeKgPerDay([{ date: day(0), kg: 90 }])).toBeNull();
    // Two weigh-ins on the same morning give no time base.
    expect(
      weightSlopeKgPerDay([
        { date: day(0), kg: 90 },
        { date: day(0), kg: 90.4 },
      ]),
    ).toBeNull();
  });

  it("does not lag a falling weight the way the smoothed trend does", () => {
    // The bias that matters. Over the first month of a diet the EWMA has not
    // caught up, so differencing its endpoints under-reports the loss — which
    // reads as a stall and cuts the user's food. The regression does not.
    const kgs = Array.from({ length: 28 }, (_, i) => 90 - i * 0.05);
    const pts = kgs.map((kg, i) => ({ date: day(i), kg }));

    const byRegression = -weightSlopeKgPerDay(pts)! * 27;
    const series = trendSeries(pts);
    const byEndpoints = series[0].kg - series[series.length - 1].kg;

    expect(byRegression).toBeCloseTo(1.35, 2); // the true loss, 27 x 0.05
    expect(byEndpoints).toBeLessThan(byRegression * 0.8); // the filter's lag
  });
});

describe("updateCalibration", () => {
  it("starts from 1 and moves half-way towards a measurement", () => {
    // Formula said 2400, the user really burns 2200 → raw factor 0.9167.
    expect(updateCalibration(null, 2200, 2400)).toBeCloseTo(1 + 0.5 * (2200 / 2400 - 1), 5);
  });

  it("converges towards a repeated measurement", () => {
    let c = updateCalibration(null, 2200, 2400);
    for (let i = 0; i < 8; i++) c = updateCalibration(c, 2200, 2400);
    expect(c).toBeCloseTo(2200 / 2400, 3);
  });

  it("clamps a wild measurement instead of rewriting the user's metabolism", () => {
    // A fortnight of badly-logged food should not be able to halve the target.
    expect(updateCalibration(1, 1000, 2400)).toBeGreaterThanOrEqual(0.75);
    expect(updateCalibration(1, 6000, 2400)).toBeLessThanOrEqual(1.25);
  });

  it("keeps the previous factor when a measurement is unusable", () => {
    expect(updateCalibration(0.9, 0, 2400)).toBe(0.9);
    expect(updateCalibration(0.9, 2200, 0)).toBe(0.9);
  });
});

describe("dailyTarget calibration", () => {
  const base: CoachInput = {
    sex: "male",
    diet: "regular",
    weightKg: 90,
    heightCm: 185,
    age: 35,
    activity: "moderate",
    pace: "steady",
  };

  it("scales maintenance by the learned factor", () => {
    expect(tdee({ ...base, tdeeCalibration: 0.9 })).toBeCloseTo(tdee(base) * 0.9, 5);
  });

  it("leaves the prediction alone when nothing has been learned yet", () => {
    expect(tdee({ ...base, tdeeCalibration: null })).toBeCloseTo(tdee(base), 5);
    expect(tdee({ ...base, tdeeCalibration: 1 })).toBeCloseTo(tdee(base), 5);
  });

  it("feeds through to the calorie target", () => {
    const slower = dailyTarget({ ...base, tdeeCalibration: 0.85 });
    expect(slower.kcal).toBeLessThan(dailyTarget(base).kcal);
  });
});

describe("weeklyReview", () => {
  const current: Macros = { kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 56 };

  // A week's movement of the trend weight, as trendChange() reports it.
  const tr = (thenKg: number, nowKg: number): TrendChange => ({
    nowKg,
    thenKg,
    changeKg: thenKg - nowKg,
    changePct: (thenKg - nowKg) / thenKg,
    spanDays: 7,
  });

  it("holds and asks for more data when the trend cannot span a week", () => {
    const r = weeklyReview({
      sex: "male",
      trend: null,
      waistDeltaCm: null,
      current,
    });
    expect(r.changed).toBe(false);
    expect(r.macros).toEqual(current);
    expect(r.changeKg).toBeNull();
  });

  it("keeps macros on a healthy 0.5-1% weekly loss", () => {
    // 90 -> 89.4 kg = 0.6667% loss (inside the band)
    const r = weeklyReview({
      sex: "male",
      trend: tr(90, 89.4),
      waistDeltaCm: null,
      current,
    });
    expect(r.changed).toBe(false);
    expect(r.macros).toEqual(current);
    expect(r.changeKg).toBeCloseTo(0.6, 5);
  });

  it("treats both edges of the healthy band as healthy", () => {
    // Exactly 0.5% (the floor) and exactly 1.0% (the ceiling) are inside the
    // band - the comparisons are >= and <=, and an off-by-one here would either
    // cut a user who is doing fine or leave one who is dropping too fast.
    for (const nowKg of [99.5, 99]) {
      const r = weeklyReview({
        sex: "male",
        trend: tr(100, nowKg),
        waistDeltaCm: null,
        current,
      });
      expect(r.changed).toBe(false);
      expect(r.macros).toEqual(current);
    }
  });

  it("adds calories when losing too fast", () => {
    // 90 -> 88 = 2.2% loss, well over the 1% cap
    const r = weeklyReview({
      sex: "male",
      trend: tr(90, 88),
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
      trend: tr(90, 89.98), // ~0.02% - below the healthy floor (a stall)
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
      trend: tr(90, 90),
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
      trend: tr(90, 91),
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
      trend: tr(90, 90),
      waistDeltaCm: 0,
      current: atFloor,
    });
    expect(r.changed).toBe(false);
    expect(r.macros.kcal).toBe(1500);
    expect(r.headline).toMatch(/floor/i);
  });

  it("recomputes macros against the trend weight, not a raw weigh-in", () => {
    // The rebuild takes its protein basis from where the trend sits today, so a
    // single heavy morning cannot inflate the next week's protein target.
    const r = weeklyReview({
      sex: "male",
      trend: tr(90, 90),
      waistDeltaCm: 0,
      current,
    });
    expect(r.macros.protein_g).toBe(180); // 90 kg x 2 g/kg, uncapped
  });
});

describe("adherence", () => {
  const days = (kcals: number[]) =>
    kcals.map((kcal, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      kcal,
    }));

  it("counts days that landed within 15% of the target", () => {
    const a = adherence(days([2000, 1900, 2100, 2000, 1850, 2150, 2000]), 2000);
    expect(a.adherentDays).toBe(7);
    expect(a.followed).toBe(true);
  });

  it("does not count a day well over the target", () => {
    const a = adherence(days([2600, 2700, 2000, 2000, 3000, 2800, 2900]), 2000);
    expect(a.adherentDays).toBe(2);
    expect(a.followed).toBe(false);
    expect(a.meanIntakeKcal).toBeGreaterThan(2000);
  });

  it("treats an unlogged week as unfollowed rather than perfect", () => {
    const a = adherence([], 2000);
    expect(a.loggedDays).toBe(0);
    expect(a.followed).toBe(false);
  });
});

describe("weeklyReview adherence gate", () => {
  const current: Macros = { kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 56 };
  const tr = (thenKg: number, nowKg: number): TrendChange => ({
    nowKg,
    thenKg,
    changeKg: thenKg - nowKg,
    changePct: (thenKg - nowKg) / thenKg,
    spanDays: 7,
  });
  const stall = {
    sex: "male" as const,
    trend: tr(90, 90),
    waistDeltaCm: 0,
    current,
    weeksOnTarget: 3,
    consistent: true,
  };
  const ate = (kcal: number): Adherence => ({
    loggedDays: 7,
    adherentDays: kcal === 2000 ? 7 : 0,
    meanIntakeKcal: kcal,
    followed: kcal === 2000,
  });

  it("refuses to cut a plan the user never actually ate", () => {
    // The spiral this prevents: user eats 2600 against a 2000 target and
    // stalls, so the coach cuts to 1860 -- a target they are now 700 kcal over
    // instead of 600. Harder to hit, missed by more, cut again.
    const r = weeklyReview({ ...stall, adherence: ate(2600) });
    expect(r.changed).toBe(false);
    expect(r.macros).toEqual(current);
    expect(r.detail).toMatch(/2600/);
    expect(r.headline).toMatch(/above your target/i);
  });

  it("cuts a stall the user genuinely ate through", () => {
    // Same stall, but the plan was followed -- so the target really is too high.
    const r = weeklyReview({ ...stall, adherence: ate(2000) });
    expect(r.changed).toBe(true);
    expect(r.macros.kcal).toBeLessThan(current.kcal);
  });

  it("asks for food logs rather than guessing when the week is blank", () => {
    const r = weeklyReview({
      ...stall,
      adherence: { loggedDays: 0, adherentDays: 0, meanIntakeKcal: null, followed: false },
    });
    expect(r.changed).toBe(false);
    expect(r.detail).toMatch(/log your food/i);
  });

  it("still adds calories to a too-fast loss regardless of logging", () => {
    // This branch protects muscle. It should not wait on paperwork.
    const r = weeklyReview({
      ...stall,
      trend: tr(90, 88),
      adherence: { loggedDays: 0, adherentDays: 0, meanIntakeKcal: null, followed: false },
    });
    expect(r.changed).toBe(true);
    expect(r.macros.kcal).toBeGreaterThan(current.kcal);
  });
});

describe("steps as an activity signal", () => {
  it("charges a heavier body more per step", () => {
    expect(stepKcal(10000, 100)).toBeGreaterThan(stepKcal(10000, 60));
  });

  it("puts 10k steps in the right ballpark", () => {
    // ~0.35 kcal/kg/km net, ~1333 steps/km: 80 kg x 10000 steps ~ 208 kcal.
    expect(stepKcal(10000, 80)).toBeCloseTo(208, 0);
  });

  it("ignores a zero or missing count", () => {
    expect(stepKcal(0, 80)).toBe(0);
    expect(stepKcal(10000, 0)).toBe(0);
  });

  it("prefers a step count to the self-reported activity level", () => {
    const common = {
      sex: "male",
      diet: "regular",
      weightKg: 80,
      heightCm: 180,
      age: 30,
      activity: "sedentary",
    } as const;
    // Someone who calls themselves sedentary but walks 14k steps a day is not
    // sedentary, and the maths should notice.
    expect(tdee({ ...common, stepsPerDay: 14000 })).toBeGreaterThan(tdee(common));
  });

  it("lets a calorie-reporting device outrank steps", () => {
    const common = {
      sex: "male",
      diet: "regular",
      weightKg: 80,
      heightCm: 180,
      age: 30,
      activity: "sedentary",
    } as const;
    // active_energy already counts the walking, so steps must not be added again.
    expect(tdee({ ...common, activeKcalPerDay: 500, stepsPerDay: 14000 })).toBeCloseTo(
      tdee({ ...common, activeKcalPerDay: 500 }),
      5,
    );
  });

  it("spots a real drop in daily steps", () => {
    expect(stepsFalling([5000, 5200, 4800], [10000, 10200, 9800]).falling).toBe(true);
    expect(stepsFalling([9500, 10000, 10200], [10000, 10200, 9800]).falling).toBe(false);
  });

  it("says nothing when there are no steps to compare", () => {
    expect(stepsFalling([], [10000]).falling).toBe(false);
    expect(stepsFalling([9000], []).falling).toBe(false);
  });
});

describe("weeklyReview step diagnosis", () => {
  const current: Macros = { kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 56 };
  const stall = {
    sex: "male" as const,
    trend: { nowKg: 90, thenKg: 90, changeKg: 0, changePct: 0, spanDays: 7 },
    waistDeltaCm: 0,
    current,
    weeksOnTarget: 3,
    consistent: true,
    adherence: {
      loggedDays: 7,
      adherentDays: 7,
      meanIntakeKcal: 2000,
      followed: true,
    },
  };

  it("blames the missing steps rather than cutting food", () => {
    // The deficit didn't vanish because maintenance rose. It vanished because
    // the user stopped walking. Cutting calories treats the symptom and makes
    // the diet harder at the same time.
    const r = weeklyReview({
      ...stall,
      stepsDropped: { falling: true, thisWeek: 4000, lastWeek: 10000 },
    });
    expect(r.changed).toBe(false);
    expect(r.macros).toEqual(current);
    expect(r.headline).toMatch(/steps/i);
    expect(r.detail).toMatch(/4000/);
    expect(r.detail).toMatch(/10000/);
  });

  it("still cuts a stall that steps do not explain", () => {
    const r = weeklyReview({
      ...stall,
      stepsDropped: { falling: false, thisWeek: 10000, lastWeek: 10200 },
    });
    expect(r.changed).toBe(true);
    expect(r.macros.kcal).toBeLessThan(current.kcal);
  });
});

describe("nextPhase", () => {
  const base = { weeksInDeficit: 3, weeksInBreak: 0, currentWeightKg: 90 };

  it("stays in a deficit while the diet is young", () => {
    expect(nextPhase(base)).toBe("deficit");
  });

  it("calls a diet break after a long unbroken deficit", () => {
    expect(nextPhase({ ...base, weeksInDeficit: 12 })).toBe("diet_break");
  });

  it("keeps the break going for a fortnight, then returns to the deficit", () => {
    expect(nextPhase({ ...base, weeksInBreak: 1 })).toBe("diet_break");
    expect(nextPhase({ ...base, weeksInBreak: 2 })).toBe("deficit");
  });

  it("switches to maintenance at the goal weight", () => {
    // An app that keeps cutting past the finish line is not coaching.
    expect(
      nextPhase({ ...base, currentWeightKg: 75, goalWeightKg: 75 }),
    ).toBe("maintenance");
    expect(
      nextPhase({ ...base, currentWeightKg: 74, goalWeightKg: 75 }),
    ).toBe("maintenance");
  });

  it("keeps dieting while the goal is still ahead", () => {
    expect(
      nextPhase({ ...base, currentWeightKg: 90, goalWeightKg: 75 }),
    ).toBe("deficit");
  });

  it("prefers maintenance over a due diet break once the goal is reached", () => {
    expect(
      nextPhase({
        weeksInDeficit: 20,
        weeksInBreak: 0,
        currentWeightKg: 75,
        goalWeightKg: 75,
      }),
    ).toBe("maintenance");
  });
});

describe("weeklyReview phases", () => {
  const current: Macros = { kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 56 };
  const healthy = {
    sex: "male" as const,
    trend: { nowKg: 90, thenKg: 90.6, changeKg: 0.6, changePct: 0.6 / 90.6, spanDays: 7 },
    waistDeltaCm: null,
    current,
    weeksOnTarget: 3,
    consistent: true,
  };

  it("raises the target to maintenance at the goal weight", () => {
    const r = weeklyReview({ ...healthy, phase: "maintenance" });
    expect(r.changed).toBe(true);
    expect(r.macros.kcal).toBeGreaterThan(current.kcal);
    expect(r.headline).toMatch(/goal/i);
  });

  it("holds once already eating at maintenance", () => {
    const r = weeklyReview({
      ...healthy,
      current: { ...current, kcal: 2500 },
      maintenanceKcal: 2500,
      phase: "maintenance",
    });
    expect(r.changed).toBe(false);
    expect(r.detail).toMatch(/maintenance/i);
  });

  it("does not keep inflating the target once it is at maintenance", () => {
    // Back-deriving maintenance from the target in force compounds: 2000 ->
    // 2500 -> 3125 -> 3906, a week at a time. The maintenance figure has to
    // come from outside the loop.
    let macros: Macros = current;
    for (let week = 0; week < 5; week++) {
      macros = weeklyReview({
        ...healthy,
        current: macros,
        maintenanceKcal: 2500,
        phase: "maintenance",
      }).macros;
    }
    expect(macros.kcal).toBe(2500);
  });

  it("puts a long-dieting user on a break instead of cutting again", () => {
    // The old review was a one-way ratchet. Nothing but a too-fast loss ever
    // moved a target up.
    const r = weeklyReview({
      ...healthy,
      trend: { nowKg: 90, thenKg: 90, changeKg: 0, changePct: 0, spanDays: 7 },
      waistDeltaCm: 0,
      maintenanceKcal: 2500,
      phase: "diet_break",
    });
    expect(r.changed).toBe(true);
    expect(r.macros.kcal).toBe(2500);
    expect(r.headline).toMatch(/diet break/i);
  });
});

describe("weeklyReview waist going the wrong way", () => {
  const current: Macros = { kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 56 };

  it("refuses to cut when the waist is growing on a flat scale", () => {
    // Composition moving the wrong way: muscle going, fat arriving. A deeper
    // deficit costs more muscle still, so cutting is the wrong response. This
    // case previously had no rule and fell straight through to a cut.
    const r = weeklyReview({
      sex: "male",
      trend: { nowKg: 90, thenKg: 90, changeKg: 0, changePct: 0, spanDays: 7 },
      waistDeltaCm: 1.5,
      current,
      weeksOnTarget: 3,
      consistent: true,
      adherence: {
        loggedDays: 7,
        adherentDays: 7,
        meanIntakeKcal: 2000,
        followed: true,
      },
    });
    expect(r.changed).toBe(false);
    expect(r.macros).toEqual(current);
    expect(r.headline).toMatch(/waist up/i);
    expect(r.detail).toMatch(/protein/i);
  });
});

describe("weeklyReview cadence gates", () => {
  const current: Macros = { kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 56 };
  const tr = (thenKg: number, nowKg: number): TrendChange => ({
    nowKg,
    thenKg,
    changeKg: thenKg - nowKg,
    changePct: (thenKg - nowKg) / thenKg,
    spanDays: 7,
  });

  // A stall that WOULD trigger a cut once the gates are open.
  const stall = {
    sex: "male" as const,
    trend: tr(90, 90),
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

  it("adjusts once the target is >=2 weeks old and logging is consistent", () => {
    const r = weeklyReview({ ...stall, weeksOnTarget: 2, consistent: true });
    expect(r.changed).toBe(true);
    expect(r.macros.kcal).toBeLessThan(current.kcal);
  });

  it("also holds a too-fast loss while the target is new (one noisy week)", () => {
    // 90 -> 88 = 2.2%/week: normally an add, but one week isn't enough to act.
    const r = weeklyReview({
      ...stall,
      trend: tr(90, 88),
      waistDeltaCm: null,
      weeksOnTarget: 1,
      consistent: true,
    });
    expect(r.changed).toBe(false);
    expect(r.headline).toMatch(/settling/i);
  });
});
