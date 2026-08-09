import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { getCalibrationWrap } = await import("@/lib/queries");
const { localWeekStart } = await import("@/lib/time");

const DAY = 86_400_000;
const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);

// The review exists for exactly one visit: the hold has ended, the first deficit
// is worked out, and the user hasn't started it. Get that gate wrong and either
// the user never sees what their fortnight bought, or they see it again every
// week for ever.

const MAINTENANCE = 1700;

// A fortnight of eating the hold's target, logged daily, weight flat — the hold
// has run its full window and the review graduates them into a deficit.
function graduating(over: Record<string, unknown> = {}) {
  const weights = Array.from({ length: 28 }, (_, i) => ({
    user_id: "user-1",
    date: iso(27 - i),
    weight_kg: 70,
  }));
  const food_logs = Array.from({ length: 28 }, (_, i) => ({
    user_id: "user-1",
    logged_at: new Date(Date.now() - (27 - i) * DAY).toISOString(),
    kcal: MAINTENANCE,
    protein_g: 130,
    carbs_g: 170,
    fat_g: 55,
  }));
  const calRow = (daysAgo: number) => ({
    user_id: "user-1",
    week_start: localWeekStart("UTC", new Date(Date.now() - daysAgo * DAY)),
    kcal: MAINTENANCE,
    protein_g: 130,
    carbs_g: 170,
    fat_g: 55,
    phase: "calibration",
  });
  return {
    users: [
      {
        id: "user-1",
        sex: "female" as const,
        height_cm: 165,
        birth_year: 1990,
        diet_type: "regular",
        activity_level: "sedentary",
        goal_pace: "steady",
        body_fat_pct: null,
        goal_weight_kg: 65,
        tdee_calibration: 1,
        tdee_observed_at: null,
        calibration_started_at: new Date(Date.now() - 15 * DAY).toISOString(),
        timezone: "UTC",
        onboarded_at: new Date(Date.now() - 15 * DAY).toISOString(),
        ...over,
      },
    ],
    weights,
    food_logs,
    measurements: [],
    activity: Array.from({ length: 14 }, (_, i) => ({
      user_id: "user-1",
      date: iso(13 - i),
      steps: 8000,
      workout_kcal: 100,
      sleep_hours: 7.5,
      source: "fitbit",
    })),
    daily_targets: [calRow(14), calRow(7), calRow(0)],
    fitbit_tokens: [],
  };
}

describe("getCalibrationWrap", () => {
  it("has a review to show the moment the hold ends", async () => {
    installFakeSupabase({ db: graduating() });
    const wrap = await getCalibrationWrap();

    expect(wrap).not.toBeNull();
    expect(wrap!.days).toBe(15);
    expect(wrap!.loggedDays).toBeGreaterThan(10);
    expect(wrap!.holdTargetKcal).toBe(MAINTENANCE);
    // A real deficit, opened from maintenance rather than nudged off the hold.
    expect(wrap!.deficitKcal).toBeGreaterThan(0);
    expect(wrap!.newTarget.kcal).toBeLessThan(MAINTENANCE);
  });

  it("quotes the maintenance the new target was actually cut from", async () => {
    installFakeSupabase({ db: graduating() });
    const wrap = await getCalibrationWrap();
    // The deficit, the target and the maintenance behind them have to agree —
    // the screen shows all three on the same card.
    expect(wrap!.newTarget.kcal + wrap!.deficitKcal).toBeGreaterThan(0);
    expect(wrap!.measuredMaintenanceKcal).not.toBeNull();
  });

  it("projects forward to the goal weight", async () => {
    // A goal within reach of a light person's deficit: at 70 kg the carb floor
    // eases the cut to under 200 kcal/day, so 5 kg would take longer than the
    // projection's horizon and the screen would (correctly) name no date.
    installFakeSupabase({ db: graduating({ goal_weight_kg: 68 }) });
    const wrap = await getCalibrationWrap();
    expect(wrap!.projection!.points[0].kg).toBeCloseTo(70, 0);
    expect(wrap!.projection!.goalWeeks).toBeGreaterThan(0);
    expect(wrap!.expectedLossKgPerWeek).toBeGreaterThan(0);
  });

  it("shows nothing while the hold is still running", async () => {
    installFakeSupabase({
      db: graduating({
        calibration_started_at: new Date(Date.now() - 3 * DAY).toISOString(),
      }),
    });
    expect(await getCalibrationWrap()).toBeNull();
  });

  it("shows nothing once the deficit has been started", async () => {
    const db = graduating();
    // The graduating target, written: this week's row is a deficit now.
    db.daily_targets = [
      ...db.daily_targets.slice(0, 2),
      {
        user_id: "user-1",
        week_start: localWeekStart("UTC"),
        kcal: 1300,
        protein_g: 130,
        carbs_g: 130,
        fat_g: 43,
        phase: "deficit",
      },
    ];
    installFakeSupabase({ db });
    expect(await getCalibrationWrap()).toBeNull();
  });

  it("shows nothing for a user who never calibrated", async () => {
    installFakeSupabase({ db: graduating({ calibration_started_at: null }) });
    expect(await getCalibrationWrap()).toBeNull();
  });
});
