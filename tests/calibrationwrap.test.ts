import { describe, expect, it } from "vitest";
import {
  calibrationWrap,
  holdDays,
  projectWeeks,
  MAX_PROJECTION_WEEKS,
  type WrapInput,
} from "@/lib/calibrationwrap";
import type { Activity, Macros } from "@/lib/types";

// The calibration wrap is the first thing the app ever tells a user about their
// own body, and every number on it drives a decision they're about to make. A
// maintenance figure that's wrong, a loss rate that flatters, or a goal date
// built on a straight line are all worse than showing nothing.

const DAY_MS = 86_400_000;
const day = (offset: number, from = "2026-08-09") =>
  new Date(Date.parse(`${from}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);

const macros = (over: Partial<Macros> = {}): Macros => ({
  kcal: 2000,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 60,
  ...over,
});

// A fortnight of complete logs: ate the hold target every day, weight flat.
function fortnight(over: Partial<WrapInput> = {}): WrapInput {
  const start = "2026-07-26";
  const dates = Array.from({ length: 14 }, (_, i) => day(i, start));
  return {
    startedAt: `${start}T08:00:00.000Z`,
    now: new Date("2026-08-09T08:00:00.000Z"),
    weighIns: dates.map((date) => ({ date, kg: 80 })),
    intake: dates.map((date) => ({ date, kcal: 2400 })),
    activity: dates.map(
      (date): Activity => ({
        date,
        steps: 9000,
        workout_kcal: 200,
        sleep_hours: 7,
        source: "fitbit",
      }),
    ),
    observed: {
      kcalPerDay: 2400,
      days: 14,
      loggedDays: 14,
      meanIntakeKcal: 2400,
      trendDeltaKg: 0,
    },
    predictedTdeeKcal: 2200,
    holdTargetKcal: 2400,
    maintenanceKcal: 2400,
    newTarget: macros({ kcal: 2000 }),
    weightKg: 80,
    goalWeightKg: 74,
    sex: "female",
    bodyFatPct: 30,
    restingRateKcal: 1500,
    ...over,
  };
}

describe("holdDays", () => {
  it("counts whole days since the hold opened", () => {
    expect(
      holdDays("2026-07-26T08:00:00.000Z", new Date("2026-08-09T09:00:00.000Z")),
    ).toBe(14);
  });

  it("never goes negative for a start in the future", () => {
    expect(
      holdDays("2026-08-20T00:00:00.000Z", new Date("2026-08-09T00:00:00.000Z")),
    ).toBe(0);
  });
});

describe("projectWeeks", () => {
  const base = {
    startKg: 80,
    maintenanceKcal: 2400,
    targetKcal: 2000,
    goalKg: null,
  };

  it("loses the deficit's worth of fat in the first week", () => {
    const { points } = projectWeeks(base);
    // 400 kcal/day × 7 ÷ 7700 = 0.3636 kg.
    expect(points[1].kg).toBeCloseTo(80 - (400 * 7) / 7700, 4);
  });

  it("slows down as the body gets lighter, never a straight line", () => {
    const { points } = projectWeeks(base);
    const firstWeek = points[0].kg - points[1].kg;
    const tenthWeek = points[9].kg - points[10].kg;
    expect(tenthWeek).toBeLessThan(firstWeek);
    expect(tenthWeek).toBeGreaterThan(0);
  });

  it("reports the week the goal is reached and the date it lands on", () => {
    const p = projectWeeks({
      ...base,
      goalKg: 78,
      from: new Date("2026-08-09T00:00:00.000Z"),
    });
    // ~0.36 kg a week, so 2 kg takes ~6 weeks.
    expect(p.goalWeeks).toBe(6);
    expect(p.goalDate).toBe("2026-09-20");
    // The curve stops at the goal rather than running on past it.
    expect(p.points[p.points.length - 1].kg).toBeLessThanOrEqual(78);
  });

  it("gives no goal date when the goal is out of reach inside the horizon", () => {
    const p = projectWeeks({ ...base, goalKg: 40 });
    expect(p.goalWeeks).toBeNull();
    expect(p.goalDate).toBeNull();
    expect(p.points.length).toBe(MAX_PROJECTION_WEEKS + 1);
  });

  it("does not pretend a target at maintenance loses weight", () => {
    const p = projectWeeks({ ...base, targetKcal: 2400, goalKg: 70 });
    expect(p.points).toEqual([{ week: 0, kg: 80 }]);
    expect(p.goalWeeks).toBeNull();
  });

  it("returns just today's weight when the numbers can't support a curve", () => {
    expect(projectWeeks({ ...base, startKg: 0 }).points).toEqual([
      { week: 0, kg: 0 },
    ]);
  });
});

describe("calibrationWrap", () => {
  it("reports the measured burn against the formula's guess", () => {
    const w = calibrationWrap(fortnight());
    expect(w.measuredMaintenanceKcal).toBe(2400);
    expect(w.predictedMaintenanceKcal).toBe(2200);
    expect(w.maintenanceDeltaKcal).toBe(200); // burns 200 more than predicted
  });

  it("counts the fortnight: days held, days logged, days weighed", () => {
    const w = calibrationWrap(fortnight());
    expect(w.days).toBe(14);
    expect(w.loggedDays).toBe(14);
    expect(w.weighInDays).toBe(14);
    expect(w.adherentDays).toBe(14);
  });

  it("counts only days inside the hold, not older logs", () => {
    const input = fortnight();
    const w = calibrationWrap({
      ...input,
      intake: [{ date: "2026-06-01", kcal: 2400 }, ...input.intake],
      weighIns: [{ date: "2026-06-01", kg: 84 }, ...input.weighIns],
    });
    expect(w.loggedDays).toBe(14);
    expect(w.weighInDays).toBe(14);
  });

  it("does not count a day the user ate far off the target as adherent", () => {
    const input = fortnight();
    const w = calibrationWrap({
      ...input,
      intake: input.intake.map((d, i) => (i < 4 ? { ...d, kcal: 3600 } : d)),
    });
    expect(w.adherentDays).toBe(10);
  });

  it("reads the scale's own answer for the hold, positive when weight came off", () => {
    const input = fortnight();
    // A steady 0.1 kg/day drop across the fortnight.
    const w = calibrationWrap({
      ...input,
      weighIns: input.weighIns.map((p, i) => ({ ...p, kg: 80 - i * 0.1 })),
    });
    expect(w.weightChangeKg).toBeCloseTo(1.4, 1);
  });

  it("states the rate the hold itself was losing at", () => {
    const input = fortnight();
    // 0.1 kg a day off the trend across a fortnight = 0.7 kg a week, at the
    // hold's own calories. The prediction that follows has to beat this.
    const w = calibrationWrap({
      ...input,
      weighIns: input.weighIns.map((p, i) => ({ ...p, kg: 80 - i * 0.1 })),
    });
    expect(w.holdLossKgPerWeek).toBeCloseTo(0.7, 1);
  });

  it("has no rate for a hold too short to have one", () => {
    const input = fortnight();
    const w = calibrationWrap({
      ...input,
      startedAt: "2026-08-06T08:00:00.000Z", // three days in
    });
    expect(w.holdLossKgPerWeek).toBeNull();
  });

  it("splits the burn into resting and moving", () => {
    const w = calibrationWrap(fortnight());
    // 2400 burned, 1500 of it at rest → 37.5% is movement.
    expect(w.activeShare).toBeCloseTo(0.375, 3);
    expect(w.meanStepsPerDay).toBe(9000);
    expect(w.meanSleepHours).toBe(7);
  });

  it("has no opinion on the split when the resting rate is unknown", () => {
    expect(calibrationWrap(fortnight({ restingRateKcal: null })).activeShare).toBeNull();
  });

  it("separates the deficit from what changes on the plate", () => {
    // Held at 2400, measured burn 2600, new target 2000: a 600 kcal deficit, but
    // only 400 kcal less food than the fortnight they just ate.
    const w = calibrationWrap(
      fortnight({
        holdTargetKcal: 2400,
        maintenanceKcal: 2600,
        newTarget: macros({ kcal: 2000 }),
      }),
    );
    expect(w.deficitKcal).toBe(600);
    expect(w.changeFromHoldKcal).toBe(400);
  });

  it("reports no change on the plate when the target matches the hold", () => {
    const w = calibrationWrap(fortnight({ newTarget: macros({ kcal: 2400 }) }));
    expect(w.changeFromHoldKcal).toBe(0);
  });

  it("states the deficit and the loss it should produce each week", () => {
    const w = calibrationWrap(fortnight());
    expect(w.deficitKcal).toBe(400);
    expect(w.expectedLossKgPerWeek).toBeCloseTo(0.364, 3);
    // 0.36 kg on 80 kg is 0.45%/week — inside a 0.5–0.75% band? No: below it.
    expect(w.inHealthyBand).toBe(false);
  });

  it("calls a rate inside the healthy band for this body healthy", () => {
    // 500 kcal/day = 0.4545 kg/week = 0.57% of 80 kg, inside 0.5–0.75%.
    const w = calibrationWrap(
      fortnight({ newTarget: macros({ kcal: 1900 }), bodyFatPct: 30 }),
    );
    expect(w.expectedLossKgPerWeek).toBeCloseTo(0.4545, 3);
    expect(w.inHealthyBand).toBe(true);
  });

  it("projects from today's weight to the goal", () => {
    const w = calibrationWrap(fortnight());
    expect(w.projection?.points[0]).toEqual({ week: 0, kg: 80 });
    expect(w.projection?.goalWeeks).toBeGreaterThan(0);
    expect(w.projection?.goalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("survives a hold with almost nothing logged", () => {
    const w = calibrationWrap(
      fortnight({
        weighIns: [{ date: "2026-07-26", kg: 80 }],
        intake: [],
        activity: [],
        observed: null,
        predictedTdeeKcal: null,
        weightKg: null,
      }),
    );
    expect(w.loggedDays).toBe(0);
    expect(w.measuredMaintenanceKcal).toBeNull();
    expect(w.maintenanceDeltaKcal).toBeNull();
    expect(w.weightChangeKg).toBeNull();
    expect(w.meanStepsPerDay).toBeNull();
    expect(w.projection).toBeNull();
    expect(w.inHealthyBand).toBeNull();
    // The one thing it must still say: what to eat now.
    expect(w.newTarget.kcal).toBe(2000);
    expect(w.deficitKcal).toBe(400);
  });
});
