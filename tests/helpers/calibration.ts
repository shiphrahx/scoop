import { localWeekStart } from "@/lib/time";

// A user whose calibration hold has run its full window: a fortnight of eating
// the target the hold pinned, logged daily, weight flat, steps synced. The
// review graduates them into their first deficit, the one moment the
// calibration review exists.
//
// Shared by the tests that read the review and the ones that start the deficit
// off it, so both are talking about the same fortnight.

const DAY = 86_400_000;
const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);

export const HOLD_TARGET_KCAL = 1700;

export function graduatingUserDb(over: Record<string, unknown> = {}) {
  const weights = Array.from({ length: 28 }, (_, i) => ({
    user_id: "user-1",
    date: iso(27 - i),
    weight_kg: 70,
  }));
  // One entry a day, named and scanned, so the review can say what was eaten
  // most and how it got into the app rather than only how many calories it came
  // to. Logged at 12:00 UTC, safely inside the day in any zone the tests use.
  const food_logs = Array.from({ length: 28 }, (_, i) => ({
    user_id: "user-1",
    logged_at: new Date(
      Date.parse(`${iso(27 - i)}T12:00:00.000Z`),
    ).toISOString(),
    name: "Porridge",
    source: "barcode",
    grams: 400,
    kcal: HOLD_TARGET_KCAL,
    protein_g: 130,
    carbs_g: 170,
    fat_g: 55,
  }));
  const calRow = (daysAgo: number) => ({
    user_id: "user-1",
    week_start: localWeekStart("UTC", new Date(Date.now() - daysAgo * DAY)),
    kcal: HOLD_TARGET_KCAL,
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
        // Past the max window, so the hold is over however the data looks.
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
    calibration_reviews: [],
    fitbit_tokens: [],
  };
}
