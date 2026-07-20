import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { ensureReviewApplied } = await import("@/app/(app)/coach/actions");

const DAY = 86_400_000;
const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);

// A user whose weight has been flat for a month on a target they genuinely ate.
// That's a stall the coach should act on.
function stalledUser() {
  const weights = Array.from({ length: 28 }, (_, i) => ({
    user_id: "user-1",
    date: iso(27 - i),
    weight_kg: 90,
  }));
  const food_logs = Array.from({ length: 28 }, (_, i) => ({
    user_id: "user-1",
    logged_at: new Date(Date.now() - (27 - i) * DAY).toISOString(),
    kcal: 2000,
    protein_g: 160,
    carbs_g: 180,
    fat_g: 56,
  }));
  return {
    users: [
      {
        id: "user-1",
        sex: "male" as const,
        height_cm: 185,
        birth_year: 1990,
        diet_type: "regular",
        activity_level: "moderate",
        goal_pace: "steady",
        body_fat_pct: null,
        goal_weight_kg: null,
        tdee_calibration: 1,
        timezone: "UTC",
      },
    ],
    weights,
    food_logs,
    measurements: [],
    activity: [],
    daily_targets: [
      // Four weeks on the same target, so the adaptation gate is open.
      { user_id: "user-1", week_start: iso(28), kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 56, phase: "deficit" },
      { user_id: "user-1", week_start: iso(21), kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 56, phase: "deficit" },
      { user_id: "user-1", week_start: iso(14), kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 56, phase: "deficit" },
      { user_id: "user-1", week_start: iso(7), kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 56, phase: "deficit" },
    ],
    fitbit_tokens: [],
  };
}

describe("ensureReviewApplied", () => {
  it("is a no-op the second time, so it can run on every app open", async () => {
    // This is the property that makes auto-running safe. Without it, mounting
    // the review on a page the user reloads would rewrite next week's target
    // over and over.
    const { db } = installFakeSupabase({ db: stalledUser() });

    const first = await ensureReviewApplied();
    const afterFirst = db.daily_targets.length;
    const second = await ensureReviewApplied();

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(db.daily_targets).toHaveLength(afterFirst);
  });

  it("writes next week's target rather than overwriting this week's", async () => {
    // Changing the target the user is living under mid-week would move the goal
    // posts on a day they've already half-eaten.
    const { db } = installFakeSupabase({ db: stalledUser() });
    const thisWeekBefore = db.daily_targets.map((t) => Number(t.kcal));

    await ensureReviewApplied();

    for (let i = 0; i < thisWeekBefore.length; i++) {
      expect(Number(db.daily_targets[i].kcal)).toBe(thisWeekBefore[i]);
    }
    expect(db.daily_targets.length).toBeGreaterThan(thisWeekBefore.length);
  });

  it("does nothing at all when there is no target to review", async () => {
    const { db } = installFakeSupabase({
      db: { ...stalledUser(), daily_targets: [] },
    });
    expect(await ensureReviewApplied()).toBe(false);
    expect(db.daily_targets).toHaveLength(0);
  });
});
