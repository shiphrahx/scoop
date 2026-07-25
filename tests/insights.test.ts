import { describe, expect, it } from "vitest";
import {
  actualVsTarget,
  adherenceVsLoss,
  correlate,
  fatLossSignal,
  goalProgress,
  highDayImpact,
  loggingStreak,
  lossRate,
  milestones,
  movementVsLoss,
  photoPairs,
  plateau,
  projectGoalDate,
  sleepVsLoss,
  trendLine,
  waistToHeight,
  weekScorecard,
  weekdayVsWeekend,
  weeklyBuckets,
  type DayIntake,
  type InsightWeek,
  type WeighIn,
} from "@/lib/insights";

// The insights dashboard tells someone how their body is going and whether to
// keep eating what they're eating. These tests exist to hold two lines:
//   - a card must stay SILENT when the history behind it is too thin
//   - the numbers it does show must be the numbers, not something near them

const DAY_MS = 86_400_000;

// Weigh-ins on consecutive days from `start`, produced by `f(i)`.
function series(start: string, days: number, f: (i: number) => number): WeighIn[] {
  const base = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(base + i * DAY_MS).toISOString().slice(0, 10),
    kg: f(i),
  }));
}

// A weigh-in run that ends flat long enough for the smoothing to have caught
// up: `hold` days at `from`, then `settle` days at `to`. Lets a test name the
// current trend weight without re-implementing the filter to predict it.
function settled(start: string, from: number, to: number): WeighIn[] {
  return [
    ...series(start, 5, () => from),
    ...series(
      new Date(Date.parse(`${start}T00:00:00Z`) + 5 * DAY_MS).toISOString().slice(0, 10),
      60,
      () => to,
    ),
  ];
}

const day = (start: string, i: number) =>
  new Date(Date.parse(`${start}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10);

describe("trendLine", () => {
  it("stays quiet until there are enough weigh-ins to smooth", () => {
    expect(trendLine(series("2026-07-06", 3, () => 90))).toEqual([]);
  });

  it("keeps a gap where the user didn't weigh in", () => {
    const points: WeighIn[] = [
      { date: "2026-07-06", kg: 90 },
      { date: "2026-07-07", kg: 90 },
      { date: "2026-07-09", kg: 90 },
      { date: "2026-07-10", kg: 90 },
    ];
    const line = trendLine(points);

    expect(line.map((p) => p.date)).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
    ]);
    expect(line.find((p) => p.date === "2026-07-08")!.weight).toBeNull();
    // Every reading is the same, so the trend can only be that same number.
    expect(line.every((p) => p.trend === 90)).toBe(true);
  });

  it("averages two weigh-ins on the same day", () => {
    const line = trendLine([
      { date: "2026-07-06", kg: 90 },
      { date: "2026-07-06", kg: 91 },
      { date: "2026-07-07", kg: 90.5 },
      { date: "2026-07-08", kg: 90.5 },
    ]);
    expect(line[0].weight).toBe(90.5);
  });
});

describe("lossRate", () => {
  it("reports a steady 100 g a day as 0.7 kg a week", () => {
    const rate = lossRate(series("2026-06-01", 29, (i) => 100 - 0.1 * i), "female");
    expect(rate!.kgPerWeek).toBe(0.7);
    expect(rate!.verdict).toBe("on-track");
    // ~0.7% of a ~99 kg bodyweight.
    expect(rate!.pctPerWeek).toBeGreaterThan(0.6);
    expect(rate!.pctPerWeek).toBeLessThan(0.8);
  });

  it("calls three times that rate too fast", () => {
    const rate = lossRate(series("2026-06-01", 29, (i) => 100 - 0.3 * i), "female");
    expect(rate!.kgPerWeek).toBe(2.1);
    expect(rate!.verdict).toBe("fast");
  });

  it("calls a rising trend gaining", () => {
    const rate = lossRate(series("2026-06-01", 29, (i) => 100 + 0.05 * i), "male");
    expect(rate!.verdict).toBe("gaining");
  });

  it("narrows the healthy band for a lean user", () => {
    const points = series("2026-06-01", 29, (i) => 100 - 0.1 * i);
    // 12% body fat on a man: the band tightens to 0.25–0.5%, so the same
    // 0.7%/week that was on track for an average user is now too fast.
    expect(lossRate(points, "male", 12)!.bandMaxPct).toBe(0.5);
    expect(lossRate(points, "male", 12)!.verdict).toBe("fast");
    expect(lossRate(points, "male", 30)!.verdict).toBe("on-track");
  });

  it("says nothing when the weigh-ins don't span a week", () => {
    expect(lossRate(series("2026-07-06", 4, (i) => 100 - 0.1 * i), "female")).toBeNull();
  });
});

describe("projectGoalDate", () => {
  const now = new Date("2026-08-01T12:00:00Z");

  it("refuses on a short history", () => {
    expect(projectGoalDate(series("2026-07-20", 10, (i) => 100 - 0.1 * i), 90, now))
      .toBeNull();
  });

  it("refuses when the trend isn't falling", () => {
    expect(projectGoalDate(series("2026-06-01", 60, () => 100), 90, now)).toBeNull();
  });

  it("refuses when the goal is already met", () => {
    expect(projectGoalDate(series("2026-06-01", 60, (i) => 100 - 0.1 * i), 99, now))
      .toBeNull();
  });

  it("gives an ordered range and a confidence level", () => {
    const p = projectGoalDate(series("2026-06-01", 60, (i) => 100 - 0.1 * i), 90, now)!;
    expect(p.goalKg).toBe(90);
    expect(p.earliest <= p.midpoint).toBe(true);
    expect(p.latest == null || p.midpoint <= p.latest).toBe(true);
    // A dead-straight 60-day line is as good as this data ever gets.
    expect(p.confidence).toBe("high");
    expect(p.midpoint > "2026-08-01").toBe(true);
  });

  it("drops to a lower confidence on a noisy line", () => {
    const noisy = series("2026-06-01", 30, (i) => 100 - 0.05 * i + (i % 2 ? 1.2 : -1.2));
    const p = projectGoalDate(noisy, 95, now);
    expect(p == null || p.confidence !== "high").toBe(true);
  });
});

describe("goalProgress", () => {
  it("reports half the journey done", () => {
    const g = goalProgress(settled("2026-05-01", 100, 95), 90)!;
    expect(g.startKg).toBe(100);
    expect(g.currentKg).toBe(95);
    expect(g.lostKg).toBe(5);
    expect(g.remainingKg).toBe(5);
    expect(g.pctComplete).toBe(50);
    expect(g.reached).toBe(false);
  });

  it("caps at 100% and flags the goal reached", () => {
    const g = goalProgress(settled("2026-05-01", 100, 88), 90)!;
    expect(g.pctComplete).toBe(100);
    expect(g.remainingKg).toBe(0);
    expect(g.reached).toBe(true);
  });

  it("needs a goal weight", () => {
    expect(goalProgress(settled("2026-05-01", 100, 95), null)).toBeNull();
  });
});

describe("fatLossSignal", () => {
  const now = new Date("2026-07-28T12:00:00Z");
  const tape = (waist: number[], dates: string[]) =>
    dates.map((date, i) => ({
      date,
      waist_cm: waist[i],
      hips_cm: null,
      thighs_cm: null,
      arms_cm: null,
      chest_cm: null,
    }));

  it("calls it when the scale is flat but the waist shrank", () => {
    const s = fatLossSignal(
      series("2026-07-01", 28, () => 90),
      tape([90, 88], ["2026-07-01", "2026-07-27"]),
      28,
      now,
    )!;
    expect(s.weightDeltaKg).toBe(0);
    expect(s.waistDeltaCm).toBe(-2);
    expect(s.detected).toBe(true);
  });

  it("stays quiet when the waist barely moved", () => {
    const s = fatLossSignal(
      series("2026-07-01", 28, () => 90),
      tape([90, 89.7], ["2026-07-01", "2026-07-27"]),
      28,
      now,
    )!;
    expect(s.detected).toBe(false);
  });

  it("stays quiet when the weight is falling anyway (nothing to explain)", () => {
    const s = fatLossSignal(
      series("2026-07-01", 28, (i) => 92 - 0.1 * i),
      tape([90, 88], ["2026-07-01", "2026-07-27"]),
      28,
      now,
    )!;
    expect(s.detected).toBe(false);
  });

  it("needs two tape readings in the window", () => {
    expect(
      fatLossSignal(
        series("2026-07-01", 28, () => 90),
        tape([90], ["2026-07-01"]),
        28,
        now,
      ),
    ).toBeNull();
  });
});

describe("waistToHeight", () => {
  it("puts a waist under half the height in the healthy band", () => {
    const w = waistToHeight(80, 170)!;
    expect(w.ratio).toBe(0.47);
    expect(w.band).toBe("healthy");
    expect(w.healthyMaxWaistCm).toBe(85);
  });

  it("flags exactly half the height as increased risk", () => {
    expect(waistToHeight(85, 170)!.band).toBe("increased");
  });

  it("flags 0.6 and above as high", () => {
    expect(waistToHeight(102, 170)!.band).toBe("high");
  });

  it("needs both numbers", () => {
    expect(waistToHeight(null, 170)).toBeNull();
    expect(waistToHeight(80, null)).toBeNull();
  });
});

describe("photoPairs", () => {
  const photo = (angle: "front" | "side", url?: string) => ({
    angle,
    signed_url: url,
  });

  it("pairs the first and latest shot of each angle", () => {
    const pairs = photoPairs([
      { date: "2026-07-06", photos: [photo("front", "b"), photo("side", "d")] },
      { date: "2026-06-01", photos: [photo("front", "a"), photo("side", "c")] },
    ]);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].angle).toBe("front");
    expect(pairs[0].start.url).toBe("a");
    expect(pairs[0].latest.url).toBe("b");
    expect(pairs[0].weeksApart).toBe(5);
  });

  it("skips an angle with one shot, an unsigned photo, or the same week", () => {
    expect(photoPairs([{ date: "2026-07-06", photos: [photo("front", "a")] }])).toEqual([]);
    expect(
      photoPairs([
        { date: "2026-06-01", photos: [photo("front", "a")] },
        { date: "2026-07-06", photos: [photo("front")] },
      ]),
    ).toEqual([]);
    expect(
      photoPairs([
        { date: "2026-07-06", photos: [photo("front", "a")] },
        { date: "2026-07-08", photos: [photo("front", "b")] },
      ]),
    ).toEqual([]);
  });
});

describe("weeklyBuckets", () => {
  // 2026-07-06 is a Monday.
  const intake = (dates: string[], kcal: number): DayIntake[] =>
    dates.map((date) => ({ date, kcal, protein_g: 150, carbs_g: 200, fat_g: 60 }));

  it("buckets food, activity, targets and high days by Monday", () => {
    const weeks = weeklyBuckets({
      weighIns: series("2026-07-06", 14, (i) => 100 - 0.1 * i),
      intake: [
        ...intake(["2026-07-06", "2026-07-07"], 2000),
        ...intake(["2026-07-13"], 1800),
      ],
      activity: [
        { date: "2026-07-06", steps: 10000, workout_kcal: 300, sleep_hours: 7 },
        { date: "2026-07-07", steps: 8000, workout_kcal: 100, sleep_hours: 8 },
      ],
      targets: [
        { week_start: "2026-07-06", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 },
        { week_start: "2026-07-13", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 },
      ],
      highDayDates: ["2026-07-11", "2026-07-12"],
    });

    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-07-06", "2026-07-13"]);

    const [first, second] = weeks;
    expect(first.loggedDays).toBe(2);
    expect(first.meanKcal).toBe(2000);
    expect(first.meanSleepH).toBe(7.5);
    expect(first.meanSteps).toBe(9000);
    expect(first.meanWorkoutKcal).toBe(200);
    expect(first.highDays).toBe(2);
    // Ate the target exactly on both logged days.
    expect(first.adherencePct).toBe(100);
    // No previous week to compare the trend against.
    expect(first.weightChangeKg).toBeNull();

    expect(second.highDays).toBe(0);
    expect(second.meanSleepH).toBeNull();
    // 1800 against a 2000 target is 10% under.
    expect(second.adherencePct).toBe(90);
    expect(second.weightChangeKg).toBeLessThan(0);
  });

  it("leaves adherence null with no target for the week", () => {
    const weeks = weeklyBuckets({
      weighIns: [],
      intake: intake(["2026-07-06"], 2000),
      activity: [],
      targets: [],
      highDayDates: [],
    });
    expect(weeks[0].adherencePct).toBeNull();
    expect(weeks[0].targetKcal).toBeNull();
  });
});

// A hand-built week, so the correlation tests control x and y exactly.
function week(weekStart: string, over: Partial<InsightWeek> = {}): InsightWeek {
  return {
    weekStart,
    weightChangeKg: null,
    meanKcal: null,
    meanProteinG: null,
    loggedDays: 0,
    targetKcal: null,
    adherencePct: null,
    meanSleepH: null,
    meanSteps: null,
    meanWorkoutKcal: null,
    highDays: 0,
    ...over,
  };
}

describe("correlate", () => {
  const sleepWeeks = [
    week("2026-06-01", { meanSleepH: 6, weightChangeKg: -0.2 }),
    week("2026-06-08", { meanSleepH: 7, weightChangeKg: -0.4 }),
    week("2026-06-15", { meanSleepH: 8, weightChangeKg: -0.6 }),
    week("2026-06-22", { meanSleepH: 9, weightChangeKg: -0.8 }),
  ];

  it("refuses under four paired weeks", () => {
    expect(sleepVsLoss(sleepWeeks.slice(0, 3))).toBeNull();
  });

  it("finds a perfect relationship and contrasts best against worst weeks", () => {
    const c = sleepVsLoss(sleepWeeks)!;
    expect(c.r).toBe(1);
    expect(c.n).toBe(4);
    expect(c.strength).toBe("strong");
    expect(c.direction).toBe("helps");
    // Best two weeks slept 9 and 8; worst two slept 7 and 6.
    expect(c.bestWeeksMean).toBe(8.5);
    expect(c.worstWeeksMean).toBe(6.5);
  });

  it("reports the reverse relationship as hurting", () => {
    const c = sleepVsLoss([
      week("2026-06-01", { meanSleepH: 9, weightChangeKg: -0.2 }),
      week("2026-06-08", { meanSleepH: 8, weightChangeKg: -0.4 }),
      week("2026-06-15", { meanSleepH: 7, weightChangeKg: -0.6 }),
      week("2026-06-22", { meanSleepH: 6, weightChangeKg: -0.8 }),
    ])!;
    expect(c.r).toBe(-1);
    expect(c.direction).toBe("hurts");
  });

  it("calls a faint relationship no relationship", () => {
    const c = correlate(
      [
        week("2026-06-01", { meanSleepH: 6, weightChangeKg: -0.5 }),
        week("2026-06-08", { meanSleepH: 7, weightChangeKg: -0.45 }),
        week("2026-06-15", { meanSleepH: 8, weightChangeKg: -0.55 }),
        week("2026-06-22", { meanSleepH: 9, weightChangeKg: -0.48 }),
      ],
      (w) => w.meanSleepH,
    )!;
    expect(Math.abs(c.r)).toBeLessThan(0.3);
    expect(c.strength).toBe("none");
    expect(c.direction).toBe("none");
  });

  it("returns null when the driver never varies", () => {
    expect(
      sleepVsLoss([
        week("2026-06-01", { meanSleepH: 7, weightChangeKg: -0.2 }),
        week("2026-06-08", { meanSleepH: 7, weightChangeKg: -0.4 }),
        week("2026-06-15", { meanSleepH: 7, weightChangeKg: -0.6 }),
        week("2026-06-22", { meanSleepH: 7, weightChangeKg: -0.8 }),
      ]),
    ).toBeNull();
  });
});

describe("movementVsLoss", () => {
  it("prefers steps", () => {
    const weeks = [7000, 8000, 9000, 10000].map((steps, i) =>
      week(day("2026-06-01", i * 7), {
        meanSteps: steps,
        meanWorkoutKcal: 200,
        weightChangeKg: -0.2 * (i + 1),
      }),
    );
    const c = movementVsLoss(weeks)!;
    expect(c.metric).toBe("steps");
    expect(c.r).toBe(1);
  });

  it("falls back to workout burn when there are no steps", () => {
    const weeks = [100, 200, 300, 400].map((kcal, i) =>
      week(day("2026-06-01", i * 7), {
        meanWorkoutKcal: kcal,
        weightChangeKg: -0.2 * (i + 1),
      }),
    );
    expect(movementVsLoss(weeks)!.metric).toBe("workout");
  });

  it("returns null with no device data at all", () => {
    const weeks = [1, 2, 3, 4].map((i) =>
      week(day("2026-06-01", i * 7), { weightChangeKg: -0.2 }),
    );
    expect(movementVsLoss(weeks)).toBeNull();
  });
});

describe("adherenceVsLoss", () => {
  it("reads sticking to the target as helping", () => {
    const c = adherenceVsLoss([
      week("2026-06-01", { adherencePct: 60, weightChangeKg: -0.1 }),
      week("2026-06-08", { adherencePct: 75, weightChangeKg: -0.35 }),
      week("2026-06-15", { adherencePct: 90, weightChangeKg: -0.6 }),
      week("2026-06-22", { adherencePct: 98, weightChangeKg: -0.75 }),
    ])!;
    expect(c.direction).toBe("helps");
    expect(c.strength).toBe("strong");
  });
});

describe("highDayImpact", () => {
  const weeks = [
    week("2026-06-01", { highDays: 2, weightChangeKg: -0.5 }),
    week("2026-06-08", { highDays: 1, weightChangeKg: -0.5 }),
    week("2026-06-15", { highDays: 0, weightChangeKg: -0.3 }),
    week("2026-06-22", { highDays: 0, weightChangeKg: -0.3 }),
  ];

  it("compares weeks with high days against weeks without", () => {
    const impact = highDayImpact(weeks)!;
    expect(impact.withWeeks).toBe(2);
    expect(impact.withoutWeeks).toBe(2);
    expect(impact.meanLossWithKg).toBe(0.5);
    expect(impact.meanLossWithoutKg).toBe(0.3);
    expect(impact.differenceKg).toBe(0.2);
    expect(impact.verdict).toBe("better");
  });

  it("calls a small gap no difference", () => {
    const impact = highDayImpact([
      week("2026-06-01", { highDays: 1, weightChangeKg: -0.45 }),
      week("2026-06-08", { highDays: 1, weightChangeKg: -0.45 }),
      week("2026-06-15", { highDays: 0, weightChangeKg: -0.4 }),
      week("2026-06-22", { highDays: 0, weightChangeKg: -0.4 }),
    ])!;
    expect(impact.verdict).toBe("no-difference");
  });

  it("needs two weeks on each side", () => {
    expect(highDayImpact(weeks.slice(1))).toBeNull();
  });
});

describe("weekScorecard", () => {
  const target = {
    week_start: "2026-07-06",
    kcal: 2000,
    protein_g: 150,
    carbs_g: 200,
    fat_g: 60,
  };
  const days: DayIntake[] = ["2026-07-06", "2026-07-07", "2026-07-08"].map((date) => ({
    date,
    kcal: 2000,
    protein_g: 150,
    carbs_g: 200,
    fat_g: 60,
  }));

  it("counts the days hit and how far into the week it is", () => {
    // Thursday of the week starting Monday 2026-07-06.
    const s = weekScorecard(days, target, "2026-07-09");
    expect(s.weekStart).toBe("2026-07-06");
    expect(s.daysSoFar).toBe(4);
    expect(s.loggedDays).toBe(3);
    expect(s.kcalHitDays).toBe(3);
    expect(s.proteinHitDays).toBe(3);
  });

  it("misses a day that overshot the calorie window but hit protein", () => {
    const s = weekScorecard(
      [...days, { date: "2026-07-09", kcal: 2600, protein_g: 160, carbs_g: 300, fat_g: 90 }],
      target,
      "2026-07-09",
    );
    expect(s.kcalHitDays).toBe(3);
    expect(s.proteinHitDays).toBe(4);
  });

  it("scores nothing without a target", () => {
    const s = weekScorecard(days, null, "2026-07-09");
    expect(s.loggedDays).toBe(3);
    expect(s.kcalHitDays).toBe(0);
    expect(s.proteinHitDays).toBe(0);
  });
});

describe("loggingStreak", () => {
  const logged = (dates: string[]): DayIntake[] =>
    dates.map((date) => ({ date, kcal: 1800, protein_g: 120, carbs_g: 180, fat_g: 50 }));

  it("counts back from today", () => {
    expect(
      loggingStreak(logged(["2026-07-07", "2026-07-08", "2026-07-09"]), "2026-07-09"),
    ).toBe(3);
  });

  it("still counts when today hasn't been logged yet", () => {
    expect(
      loggingStreak(logged(["2026-07-06", "2026-07-07", "2026-07-08"]), "2026-07-09"),
    ).toBe(3);
  });

  it("breaks after two missed days", () => {
    expect(
      loggingStreak(logged(["2026-07-05", "2026-07-06", "2026-07-07"]), "2026-07-09"),
    ).toBe(0);
  });

  it("stops at the gap", () => {
    expect(
      loggingStreak(
        logged(["2026-07-04", "2026-07-06", "2026-07-07", "2026-07-08"]),
        "2026-07-08",
      ),
    ).toBe(3);
  });
});

describe("actualVsTarget", () => {
  it("averages logged days only and signs the gap", () => {
    const rows = actualVsTarget(
      [
        { date: "2026-07-06", kcal: 2200, protein_g: 140, carbs_g: 220, fat_g: 70 },
        { date: "2026-07-07", kcal: 2400, protein_g: 160, carbs_g: 240, fat_g: 80 },
      ],
      [
        { week_start: "2026-07-06", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 },
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].loggedDays).toBe(2);
    expect(rows[0].actual).toEqual({ kcal: 2300, protein_g: 150, carbs_g: 230, fat_g: 75 });
    expect(rows[0].delta).toEqual({ kcal: 300, protein_g: 0, carbs_g: 30, fat_g: 15 });
  });

  it("skips a week with no target on record", () => {
    expect(
      actualVsTarget(
        [{ date: "2026-07-06", kcal: 2200, protein_g: 140, carbs_g: 220, fat_g: 70 }],
        [],
      ),
    ).toEqual([]);
  });
});

describe("weekdayVsWeekend", () => {
  const at = (date: string, kcal: number): DayIntake => ({
    date,
    kcal,
    protein_g: 150,
    carbs_g: 200,
    fat_g: 60,
  });

  it("prices up a bigger weekend", () => {
    const w = weekdayVsWeekend([
      // Mon–Fri of two weeks (2026-07-06 is a Monday), plus three weekend days.
      ...["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09"].map((d) => at(d, 1800)),
      ...["2026-07-13", "2026-07-14", "2026-07-15"].map((d) => at(d, 1800)),
      ...["2026-07-11", "2026-07-12", "2026-07-18"].map((d) => at(d, 2600)),
    ])!;
    expect(w.weekdayMeanKcal).toBe(1800);
    expect(w.weekendMeanKcal).toBe(2600);
    expect(w.differenceKcal).toBe(800);
    expect(w.weeklyCostKcal).toBe(1600);
    expect(w.pattern).toBe("bigger-weekends");
  });

  it("calls a small gap even", () => {
    const w = weekdayVsWeekend([
      ...["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"].map((d) =>
        at(d, 1800),
      ),
      at("2026-07-13", 1800),
      ...["2026-07-11", "2026-07-12", "2026-07-18"].map((d) => at(d, 1850)),
    ])!;
    expect(w.pattern).toBe("even");
  });

  it("needs enough of both kinds of day", () => {
    expect(
      weekdayVsWeekend([at("2026-07-06", 1800), at("2026-07-11", 2600)]),
    ).toBeNull();
  });
});

describe("milestones", () => {
  it("awards a marker for every kilo the trend has passed", () => {
    const board = milestones(settled("2026-05-01", 100, 96.5), 90);
    // The trend settles at 96.5, so 99, 98 and 97 are behind it and 96 isn't.
    expect(board.reached.map((m) => m.label)).toEqual([
      "3 kg down",
      "2 kg down",
      "1 kg down",
    ]);
    expect(board.next!.label).toBe("4 kg down");
    expect(board.toNextKg).toBeCloseTo(0.5, 1);
  });

  it("ticks a custom milestone off by weight, and by hand without one", () => {
    const board = milestones(settled("2026-05-01", 100, 96.5), 90, [
      { id: "a", label: "Size 14 jeans", target_weight_kg: 98, reached_at: null },
      { id: "b", label: "Ran 5k", target_weight_kg: null, reached_at: "2026-06-10" },
      { id: "c", label: "Holiday weight", target_weight_kg: 92, reached_at: null },
    ]);
    const byId = new Map(board.reached.map((m) => [m.id, m]));
    expect(byId.get("a")!.reached).toBe(true);
    expect(byId.get("b")!.reachedOn).toBe("2026-06-10");
    expect(byId.has("c")).toBe(false);
  });

  it("returns an empty board with no weigh-ins", () => {
    expect(milestones([], 90)).toEqual({ reached: [], next: null, toNextKg: null });
  });
});

describe("plateau", () => {
  const now = new Date("2026-07-28T12:00:00Z");

  it("calls a flat three weeks a plateau", () => {
    const p = plateau(series("2026-07-08", 21, () => 90), 3, now)!;
    expect(p.changeKg).toBe(0);
    expect(p.detected).toBe(true);
  });

  it("doesn't call it while the trend is still falling", () => {
    const p = plateau(series("2026-07-08", 21, (i) => 90 - 0.15 * i), 3, now)!;
    expect(p.changeKg).toBeLessThan(-1);
    expect(p.detected).toBe(false);
  });

  it("counts a creeping gain as a plateau too", () => {
    const p = plateau(series("2026-07-08", 21, (i) => 90 + 0.02 * i), 3, now)!;
    expect(p.detected).toBe(true);
  });

  it("says nothing when the weigh-ins don't cover the window", () => {
    expect(plateau(series("2026-07-24", 5, () => 90), 3, now)).toBeNull();
    expect(plateau(series("2026-07-08", 3, () => 90), 3, now)).toBeNull();
  });
});
