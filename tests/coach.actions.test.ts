import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { ensureReviewApplied, applyReview } = await import("@/app/(app)/coach/actions");
const { localWeekStart } = await import("@/lib/time");

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

// A user with no weigh-ins yet, so there's no trend for the review to act on: it
// HOLDS with no macro change — the safe-to-auto-advance case. Same target
// history as the stall.
function heldReviewUser() {
  return {
    ...stalledUser(),
    weights: [],
  };
}

// A user whose calibration hold has run its full window: a fortnight of eating
// at the estimated maintenance the hold pinned, logged daily, weight flat. The
// review graduates them into their first deficit.
function graduatingUser() {
  const MAINTENANCE = 1700;
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
        goal_weight_kg: null,
        tdee_calibration: 1,
        tdee_observed_at: null,
        // Past the max window, so the hold is over however the data looks.
        calibration_started_at: new Date(Date.now() - 15 * DAY).toISOString(),
        timezone: "UTC",
      },
    ],
    weights,
    food_logs,
    measurements: [],
    activity: [],
    daily_targets: [calRow(14), calRow(7), calRow(0)],
    fitbit_tokens: [],
  };
}

describe("ensureReviewApplied", () => {
  it("does NOT auto-apply a target change — a change is only a proposal", async () => {
    // The app must never move the user's macros without them choosing to. A
    // stall would cut calories; that cut waits for the user to apply it.
    const { db } = installFakeSupabase({ db: stalledUser() });
    const before = db.daily_targets.length;

    const applied = await ensureReviewApplied();

    expect(applied).toBe(false);
    expect(db.daily_targets).toHaveLength(before); // nothing written
  });

  it("auto-advances a HELD week (no change) so the chain stays unbroken, idempotently", async () => {
    // Holding weeks carry no macro change, so writing them silently is fine — and
    // necessary, or the run of weekly rows the adaptation gate counts breaks.
    const { db } = installFakeSupabase({ db: heldReviewUser() });
    const before = db.daily_targets.length;

    const first = await ensureReviewApplied();
    const afterFirst = db.daily_targets.length;
    const second = await ensureReviewApplied();

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(afterFirst).toBe(before + 1);
    expect(db.daily_targets).toHaveLength(afterFirst);
  });

  it("writes next week's row, never overwriting this week's", async () => {
    const { db } = installFakeSupabase({ db: heldReviewUser() });
    const thisWeekBefore = db.daily_targets.map((t) => Number(t.kcal));

    await ensureReviewApplied();

    for (let i = 0; i < thisWeekBefore.length; i++) {
      expect(Number(db.daily_targets[i].kcal)).toBe(thisWeekBefore[i]);
    }
    expect(db.daily_targets.length).toBe(thisWeekBefore.length + 1);
  });

  it("does nothing at all when there is no target to review", async () => {
    const { db } = installFakeSupabase({
      db: { ...stalledUser(), daily_targets: [] },
    });
    expect(await ensureReviewApplied()).toBe(false);
    expect(db.daily_targets).toHaveLength(0);
  });
});

describe("applyReview", () => {
  it("writes the changed target when the user chooses to apply it", async () => {
    // The manual path: the stall's cut only lands once the user opts in.
    const { db } = installFakeSupabase({ db: stalledUser() });
    const before = db.daily_targets.length;

    await applyReview();

    expect(db.daily_targets.length).toBe(before + 1);
    const written = db.daily_targets[db.daily_targets.length - 1];
    expect(Number(written.kcal)).toBeLessThan(2000); // a stall cuts calories
  });

  it("graduating from calibration changes THIS week's target, not next week's", async () => {
    // The hold ends mid-week off its own timestamp. Deferring the first deficit
    // to Monday left the planner on maintenance for days after the coach said
    // the cut had started — which is what "nothing changed" looked like.
    const { db } = installFakeSupabase({ db: graduatingUser() });
    const thisWeek = localWeekStart("UTC");

    await applyReview();

    const row = db.daily_targets.find((t) => t.week_start === thisWeek);
    expect(row).toBeDefined();
    expect(row!.phase).toBe("deficit");
    expect(Number(row!.kcal)).toBeLessThan(1700);
    // Nothing written for next week: the target in force IS the new one.
    const nextWeek = localWeekStart("UTC", new Date(Date.now() + 7 * DAY));
    expect(db.daily_targets.some((t) => t.week_start === nextWeek)).toBe(false);
  });

  it("applying the graduation twice does not walk the target down", async () => {
    // Each apply used to fold the same measurement into the calibration factor
    // again AND leave this week still in calibration, so the next render
    // re-proposed the transition off a lower maintenance estimate — 1500, then
    // 1378, then 1300, all from one fortnight of data.
    const { db } = installFakeSupabase({ db: graduatingUser() });
    const thisWeek = localWeekStart("UTC");

    await applyReview();
    const first = Number(db.daily_targets.find((t) => t.week_start === thisWeek)!.kcal);
    await applyReview();

    expect(Number(db.daily_targets.find((t) => t.week_start === thisWeek)!.kcal)).toBe(
      first,
    );
    for (const t of db.daily_targets) {
      if (t.phase === "deficit") expect(Number(t.kcal)).toBe(first);
    }
  });
});
