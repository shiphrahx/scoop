import { describe, expect, it } from "vitest";
import {
  DEFAULT_STRIDE_M,
  KCAL_PER_LITRE_BOILED,
  energyEquivalents,
  habitStats,
  longestRun,
  movementStats,
  plateStats,
  sleepStats,
  storageKcal,
  strideMetres,
  type WrapFoodLog,
} from "@/lib/wrapstats";
import type { Activity } from "@/lib/types";

// These numbers are the recognisable part of the calibration review: the user
// checks them against their own memory of the fortnight before they believe
// anything else on the screen. A step total that counts days they never carried
// their phone, or a "most eaten" food they only logged once, costs the trust the
// measurement cards need.

const DAY_MS = 86_400_000;
const day = (offset: number, from = "2026-07-26") =>
  new Date(Date.parse(`${from}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);

const activity = (over: Partial<Activity> & { date: string }): Activity => ({
  steps: null,
  workout_kcal: null,
  sleep_hours: null,
  source: "fitbit",
  ...over,
});

const log = (over: Partial<WrapFoodLog> = {}): WrapFoodLog => ({
  date: day(0),
  hour: 12,
  name: "Porridge",
  source: "manual",
  kcal: 400,
  protein_g: 20,
  grams: 300,
  ...over,
});

describe("longestRun", () => {
  it("counts the best stretch, not the one ending last", () => {
    // Four days, a gap, then two. The record is the four.
    const dates = [day(0), day(1), day(2), day(3), day(5), day(6)];
    expect(longestRun(dates)).toBe(4);
  });

  it("ignores duplicates and unsorted input", () => {
    expect(longestRun([day(2), day(0), day(1), day(1)])).toBe(3);
  });

  it("is zero on nothing and one on a single day", () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun([day(4)])).toBe(1);
  });
});

describe("strideMetres", () => {
  it("scales with height", () => {
    expect(strideMetres(165, "female")).toBeCloseTo(0.681, 3);
    expect(strideMetres(185, "male")).toBeCloseTo(0.768, 3);
  });

  it("falls back to the coach's walking model when height is unknown", () => {
    expect(strideMetres(null, "female")).toBe(DEFAULT_STRIDE_M);
    expect(strideMetres(0, "male")).toBe(DEFAULT_STRIDE_M);
  });
});

describe("movementStats", () => {
  const week = [
    activity({ date: day(0), steps: 6000, workout_kcal: 100 }),
    activity({ date: day(1), steps: 12000 }),
    activity({ date: day(2), steps: 10000 }),
    activity({ date: day(3), steps: 11000, workout_kcal: 250 }),
    activity({ date: day(4), steps: 4000 }),
  ];

  it("totals the walking and turns it into distance", () => {
    const m = movementStats(week, { heightCm: 165, sex: "female" })!;
    expect(m.totalSteps).toBe(43000);
    expect(m.days).toBe(5);
    // 43,000 steps at a 0.681 m stride.
    expect(m.distanceKm).toBeCloseTo(29.3, 1);
    expect(m.meanStepsPerDay).toBe(8600);
    expect(m.workoutKcal).toBe(350);
  });

  it("names the best day and the best run against the user's own median", () => {
    const m = movementStats(week, { heightCm: 165, sex: "female" })!;
    expect(m.bestDay).toEqual({ date: day(1), steps: 12000 });
    expect(m.medianSteps).toBe(10000);
    // Days 1 to 3 all sit at or above 10,000; day 0 and day 4 do not.
    expect(m.streakDays).toBe(3);
  });

  it("leaves out days the phone stayed on the table", () => {
    // A zero-step day is missing data, not a day spent motionless: averaging it
    // in would halve the mean and drag the median under every real day.
    const withGap = [...week, activity({ date: day(5), steps: 0 })];
    const m = movementStats(withGap, { heightCm: 165, sex: "female" })!;
    expect(m.days).toBe(5);
    expect(m.meanStepsPerDay).toBe(8600);
  });

  it("has nothing to say without a step count", () => {
    expect(
      movementStats([activity({ date: day(0), sleep_hours: 7 })], {
        heightCm: 165,
        sex: "female",
      }),
    ).toBeNull();
  });
});

describe("sleepStats", () => {
  it("totals the nights that were actually recorded", () => {
    const s = sleepStats([
      activity({ date: day(0), sleep_hours: 7 }),
      activity({ date: day(1), sleep_hours: 8.5 }),
      activity({ date: day(2) }),
    ])!;
    expect(s.nights).toBe(2);
    expect(s.totalHours).toBe(15.5);
    expect(s.meanHours).toBe(7.75);
    expect(s.bestNight).toEqual({ date: day(1), hours: 8.5 });
  });

  it("is null when no wearable ever reported sleep", () => {
    expect(sleepStats([activity({ date: day(0), steps: 9000 })])).toBeNull();
  });
});

describe("plateStats", () => {
  it("counts foods, weight and protein across the fortnight", () => {
    const p = plateStats([
      log({ name: "Porridge", kcal: 400, protein_g: 20, grams: 300 }),
      log({ name: "porridge ", kcal: 300, protein_g: 15, grams: 250 }),
      log({ name: "Chicken", kcal: 500, protein_g: 60, grams: 200 }),
      log({ name: "Lager", kcal: 180, protein_g: 0, grams: null, source: "alcohol" }),
    ])!;
    expect(p.logs).toBe(4);
    // Case and trailing space are the same porridge.
    expect(p.distinctFoods).toBe(3);
    expect(p.totalGrams).toBe(750);
    expect(p.weighedLogs).toBe(3);
    expect(p.totalProteinG).toBe(95);
    expect(p.alcoholKcal).toBe(180);
  });

  it("names the most logged food and what one of them costs", () => {
    const p = plateStats([
      log({ name: "Porridge", kcal: 400 }),
      log({ name: "Porridge", kcal: 300 }),
      log({ name: "Chicken", kcal: 500 }),
    ])!;
    expect(p.topFood).toEqual({ name: "Porridge", count: 2, meanKcal: 350 });
  });

  it("refuses to call a one-off a habit", () => {
    const p = plateStats([log({ name: "Porridge" }), log({ name: "Chicken" })])!;
    expect(p.topFood).toBeNull();
  });

  it("is null on an empty log", () => {
    expect(plateStats([])).toBeNull();
  });
});

describe("habitStats", () => {
  it("reads the best streaks, the busiest hour and the tapping", () => {
    const h = habitStats({
      logs: [
        log({ date: day(0), hour: 8, source: "barcode" }),
        log({ date: day(0), hour: 20, source: "manual" }),
        log({ date: day(1), hour: 8, source: "batch" }),
        log({ date: day(1), hour: 19, source: "manual" }),
      ],
      loggedDates: [day(0), day(1), day(2), day(4)],
      onTargetDates: [day(0), day(1)],
    })!;
    expect(h.logs).toBe(4);
    expect(h.longestLogStreak).toBe(3);
    expect(h.longestOnTargetStreak).toBe(2);
    // Last log of day 0 was 20:00 and of day 1 was 19:00.
    expect(h.lastLogHour).toBe(20);
    expect(h.busiestHour).toBe(8);
    expect(h.oneTapLogs).toBe(2);
  });

  it("is null when nothing was ever logged", () => {
    expect(habitStats({ logs: [], loggedDates: [], onTargetDates: [] })).toBeNull();
  });
});

describe("energyEquivalents", () => {
  const topFood = { name: "Porridge", count: 9, meanKcal: 400 };

  it("puts a fortnight's burn beside things a person can picture", () => {
    const eq = energyEquivalents(24000, { weightKg: 80, topFood });
    expect(eq.map((e) => e.key)).toEqual(["food", "walk", "boil"]);
    expect(eq[0]).toEqual({ key: "food", count: 60, unit: "servings of Porridge" });
    // 0.5 kcal per kg per km at 80 kg is 40 kcal a km.
    expect(eq[1].count).toBe(600);
    expect(eq[2].count).toBe(24000 / KCAL_PER_LITRE_BOILED);
  });

  it("drops what it cannot work out rather than guessing", () => {
    const eq = energyEquivalents(24000, { weightKg: null, topFood: null });
    expect(eq.map((e) => e.key)).toEqual(["boil"]);
  });

  it("has nothing to compare when there is no energy", () => {
    expect(energyEquivalents(0, { weightKg: 80, topFood })).toEqual([]);
  });
});

describe("storageKcal", () => {
  it("prices the weight lost in the energy it took to shift", () => {
    expect(storageKcal(0.9)).toBe(6930);
  });

  it("is null when the scale did not go down", () => {
    expect(storageKcal(0)).toBeNull();
    expect(storageKcal(-0.4)).toBeNull();
    expect(storageKcal(null)).toBeNull();
  });
});
