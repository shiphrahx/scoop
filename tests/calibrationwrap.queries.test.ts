import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";
import { graduatingUserDb, HOLD_TARGET_KCAL } from "./helpers/calibration";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { getCalibrationWrap } = await import("@/lib/queries");
const { localWeekStart } = await import("@/lib/time");

const DAY = 86_400_000;

// The review exists for exactly one visit: the hold has ended, the first deficit
// is worked out, and the user hasn't started it. Get that gate wrong and either
// the user never sees what their fortnight bought, or they see it again every
// week for ever.
const graduating = graduatingUserDb;

describe("getCalibrationWrap", () => {
  it("has a review to show the moment the hold ends", async () => {
    installFakeSupabase({ db: graduating() });
    const wrap = await getCalibrationWrap();

    expect(wrap).not.toBeNull();
    expect(wrap!.days).toBe(15);
    expect(wrap!.loggedDays).toBeGreaterThan(10);
    expect(wrap!.holdTargetKcal).toBe(HOLD_TARGET_KCAL);
    // A real deficit, opened from maintenance rather than nudged off the hold.
    expect(wrap!.deficitKcal).toBeGreaterThan(0);
    expect(wrap!.newTarget.kcal).toBeLessThan(HOLD_TARGET_KCAL);
  });

  it("quotes the maintenance the new target was actually cut from", async () => {
    installFakeSupabase({ db: graduating() });
    const wrap = await getCalibrationWrap();
    // The deficit, the target and the maintenance behind them have to agree,
    // the screen shows all three on the same card.
    expect(wrap!.newTarget.kcal + wrap!.deficitKcal!).toBeGreaterThan(0);
    expect(wrap!.measuredMaintenanceKcal).not.toBeNull();
  });

  it("holds the target when the food log came to far less than the plan", async () => {
    // The reported case, end to end. A fortnight held at 1,720 kcal with a log
    // averaging 898 and 0.54 kg a week coming off: the energy balance arithmetic
    // reads a burn of about 1,490, which is barely above this user's resting rate,
    // and cutting from it lands the target ON that resting rate. The user is told
    // to eat 340 kcal less and expect a fifth of the loss they were already
    // getting. Nothing in the numbers is wrong except the log they came from.
    const db = graduating();
    const rows = db.food_logs.length;
    db.food_logs = db.food_logs.map((r) => ({ ...r, kcal: 898 }));
    db.weights = db.weights.map((r, i) => ({
      ...r,
      weight_kg: 75 - i * (0.54 / 7),
    }));
    db.daily_targets = db.daily_targets.map((r) => ({ ...r, kcal: 1720 }));
    expect(db.food_logs).toHaveLength(rows);

    installFakeSupabase({ db });
    const wrap = await getCalibrationWrap();

    expect(wrap).not.toBeNull();
    expect(wrap!.measurementDoubt).toBe("intake_shortfall");
    expect(wrap!.measuredMaintenanceKcal).toBeNull();
    // The target the user keeps eating, and the rate their own fortnight showed.
    expect(wrap!.newTarget.kcal).toBe(1720);
    expect(wrap!.changeFromHoldKcal).toBe(0);
    expect(wrap!.expectedLossKgPerWeek).toBeGreaterThan(0.4);
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
