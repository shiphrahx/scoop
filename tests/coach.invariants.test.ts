import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dailyTarget, macrosForKcal, type CoachInput } from "@/lib/coach";
import type { ActivityLevel, DietType, GoalPace, Sex } from "@/lib/types";

// Properties the macro maths must hold for EVERY user, not just the tidy ones in
// the example-based tests. The example tests pin the happy path; these pin the
// rules that must never break — the ones a real user finds at the extremes
// (very heavy, very light, very old, at the calorie floor).

// A target's macros have to describe the calories they sit next to: a user told
// "eat 1200 kcal: 240 g protein, 0 g carbs, 11 g fat" has been handed two
// numbers that contradict each other (that protein alone is 960 kcal).
// Grams are whole numbers, so allow the rounding slack that costs: fat rounds to
// ±4.5 kcal, carbs to ±2, protein to ±2.
const ROUNDING_KCAL = 12;

function energyOf(m: { protein_g: number; carbs_g: number; fat_g: number }) {
  return m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
}

const DIETS: DietType[] = ["regular", "keto"];

// Real human ranges, deliberately including the extremes that break naive maths.
const kcal = fc.integer({ min: 800, max: 4000 });
const weight = fc.integer({ min: 35, max: 250 });
const height = fc.integer({ min: 130, max: 220 });
const diet = fc.constantFrom(...DIETS);

describe("macrosForKcal invariants", () => {
  it("macros always add up to the calorie target they are sold with", () => {
    fc.assert(
      fc.property(kcal, weight, diet, (k, w, d) => {
        const m = macrosForKcal(k, w, d);
        expect(Math.abs(energyOf(m) - m.kcal)).toBeLessThanOrEqual(ROUNDING_KCAL);
      }),
    );
  });

  it("holds with the protein cap in play (height and goal weight)", () => {
    fc.assert(
      fc.property(
        kcal,
        weight,
        height,
        fc.option(weight, { nil: undefined }),
        diet,
        (k, w, h, goal, d) => {
          const m = macrosForKcal(k, w, d, h, goal);
          expect(Math.abs(energyOf(m) - m.kcal)).toBeLessThanOrEqual(ROUNDING_KCAL);
        },
      ),
    );
  });

  it("never returns a negative gram target", () => {
    fc.assert(
      fc.property(kcal, weight, height, diet, (k, w, h, d) => {
        const m = macrosForKcal(k, w, d, h);
        expect(m.protein_g).toBeGreaterThanOrEqual(0);
        expect(m.carbs_g).toBeGreaterThanOrEqual(0);
        expect(m.fat_g).toBeGreaterThanOrEqual(0);
        expect(m.fiber_g).toBeGreaterThanOrEqual(0);
        expect(m.sodium_mg).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("keeps carbs under the keto ceiling whatever the calories", () => {
    fc.assert(
      fc.property(kcal, weight, (k, w) => {
        expect(macrosForKcal(k, w, "keto").carbs_g).toBeLessThanOrEqual(25);
      }),
    );
  });

  it("never prescribes more protein than 2 g per kg of the basis weight", () => {
    fc.assert(
      fc.property(kcal, weight, diet, (k, w, d) => {
        expect(macrosForKcal(k, w, d).protein_g).toBeLessThanOrEqual(w * 2);
      }),
    );
  });
});

const SEXES: Sex[] = ["male", "female"];
const ACTIVITIES: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];
const PACES: GoalPace[] = ["gentle", "steady", "aggressive"];

const anyUser: fc.Arbitrary<CoachInput> = fc.record({
  sex: fc.constantFrom(...SEXES),
  diet: diet,
  weightKg: weight,
  heightCm: height,
  age: fc.integer({ min: 16, max: 95 }),
  activity: fc.constantFrom(...ACTIVITIES),
  pace: fc.constantFrom(...PACES),
  bodyFatPct: fc.option(fc.integer({ min: 5, max: 60 }), { nil: null }),
  goalWeightKg: fc.option(weight, { nil: null }),
  activeKcalPerDay: fc.option(fc.integer({ min: 0, max: 1500 }), { nil: null }),
});

describe("dailyTarget invariants", () => {
  it("issues a coherent target for any user", () => {
    fc.assert(
      fc.property(anyUser, (u) => {
        const t = dailyTarget(u);
        expect(Math.abs(energyOf(t) - t.kcal)).toBeLessThanOrEqual(ROUNDING_KCAL);
      }),
    );
  });

  it("never sends anyone below the safety floor for their sex", () => {
    fc.assert(
      fc.property(anyUser, (u) => {
        const floor = u.sex === "male" ? 1500 : 1200;
        expect(dailyTarget(u).kcal).toBeGreaterThanOrEqual(floor);
      }),
    );
  });
});
