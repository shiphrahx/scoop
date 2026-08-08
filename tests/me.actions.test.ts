import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";
import { isEncrypted } from "@/lib/crypto";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const {
  saveApiKey,
  clearApiKey,
  saveGoals,
  saveMealSlots,
  saveNutrientPrefs,
  saveCycling,
  restartCalibration,
} = await import("@/app/(app)/me/actions");

const userRow = () => ({
  id: "user-1",
  diet_type: "regular",
  height_cm: 170,
  sex: "female" as const,
  birth_year: 1990,
  anthropic_api_key: null,
  meal_slots: ["Breakfast", "Dinner"],
  nutrient_prefs: ["protein_g"],
});

let savedKey: string | undefined;
beforeEach(() => {
  savedKey = process.env.SECRET_ENCRYPTION_KEY;
  process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});
afterEach(() => {
  process.env.SECRET_ENCRYPTION_KEY = savedKey;
});

describe("saveApiKey", () => {
  it("stores the key encrypted, never in the clear", async () => {
    const { db } = installFakeSupabase({ db: { users: [userRow()] } });

    await saveApiKey("sk-ant-test-123");

    const stored = String(db.users[0].anthropic_api_key);
    expect(stored).not.toContain("sk-ant-test-123");
    expect(isEncrypted(stored)).toBe(true);
  });

  it("rejects something that is not an Anthropic key", async () => {
    installFakeSupabase({ db: { users: [userRow()] } });
    await expect(saveApiKey("hunter2")).rejects.toThrow(/sk-ant/);
  });
});

describe("clearApiKey", () => {
  it("wipes the stored key", async () => {
    const { db } = installFakeSupabase({
      db: { users: [{ ...userRow(), anthropic_api_key: "enc.v1.something" }] },
    });
    await clearApiKey();
    expect(db.users[0].anthropic_api_key).toBeNull();
  });
});

describe("saveMealSlots", () => {
  it("trims, de-duplicates and keeps the order", async () => {
    const { db } = installFakeSupabase({ db: { users: [userRow()] } });

    await saveMealSlots([" Breakfast ", "Lunch", "lunch", "", "Dinner"]);

    expect(db.users[0].meal_slots).toEqual(["Breakfast", "Lunch", "Dinner"]);
  });

  it("refuses to leave the user with no meals", async () => {
    installFakeSupabase({ db: { users: [userRow()] } });
    await expect(saveMealSlots(["", "  "])).rejects.toThrow(/at least one/i);
  });
});

describe("saveNutrientPrefs", () => {
  it("keeps only known nutrient keys", async () => {
    const { db } = installFakeSupabase({ db: { users: [userRow()] } });

    await saveNutrientPrefs(["protein", "not-a-nutrient", "fiber"]);

    expect(db.users[0].nutrient_prefs).toEqual(["protein", "fiber"]);
  });

  it("refuses an empty selection", async () => {
    installFakeSupabase({ db: { users: [userRow()] } });
    await expect(saveNutrientPrefs(["nonsense"])).rejects.toThrow(/at least one/i);
  });
});

describe("saveCycling", () => {
  it("saves the master switch and a manual count clamped to the safe range", async () => {
    const { db } = installFakeSupabase({ db: { users: [userRow()] } });

    // 9 is above the safe max — it must be clamped, never stored raw.
    await saveCycling({ enabled: true, highDaysPerWeek: 9 });

    expect(db.users[0].cycling_enabled).toBe(true);
    expect(db.users[0].high_days_per_week).toBe(3); // HIGH_DAYS_SAFE_MAX
    // The carb amount is calculated, not stored, so nothing is written for it.
    expect(db.users[0].high_day_surplus_g_carbs).toBeUndefined();
  });

  it("stores a null count to follow the goal-based recommendation", async () => {
    const { db } = installFakeSupabase({ db: { users: [userRow()] } });

    await saveCycling({ enabled: true, highDaysPerWeek: null });

    expect(db.users[0].high_days_per_week).toBeNull();
  });
});

describe("saveGoals", () => {
  it("updates the profile and recomputes this week's target from the latest weight", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [userRow()],
        weights: [{ user_id: "user-1", date: "2026-07-15", weight_kg: 80 }],
        activity: [],
        daily_targets: [],
      },
    });

    await saveGoals({
      diet_type: "vegan",
      activity_level: "moderate",
      goal_pace: "steady",
    });

    expect(db.users[0].diet_type).toBe("vegan");
    expect(db.users[0].activity_level).toBe("moderate");
    expect(db.daily_targets).toHaveLength(1);
    const t = db.daily_targets[0];
    expect(Number(t.kcal)).toBeGreaterThan(800); // a real target, not zero
    expect(Number(t.protein_g)).toBeGreaterThan(0);
  });

  it("keeps the learned calibration when recomputing", async () => {
    // The weekly review spends weeks measuring what this user actually burns.
    // Saving an unrelated preference used to recompute the target straight from
    // the formula and throw all of it away, dropping them back onto the
    // textbook's guess.
    // A larger profile with headroom above the resting-rate floor: the
    // conservative maintenance estimate sits close to that floor, so a smaller
    // body would land BOTH the calibrated and uncalibrated targets on the floor
    // and hide the difference this test exists to prove.
    const bigBody = { sex: "male" as const, height_cm: 185 };
    const calibrated = installFakeSupabase({
      db: {
        users: [{ ...userRow(), ...bigBody, tdee_calibration: 0.8 }],
        weights: [{ user_id: "user-1", date: "2026-07-15", weight_kg: 100 }],
        activity: [],
        daily_targets: [],
      },
    });
    await saveGoals({
      diet_type: "regular",
      activity_level: "moderate",
      goal_pace: "steady",
    });
    const withCalibration = Number(calibrated.db.daily_targets[0].kcal);

    const plain = installFakeSupabase({
      db: {
        users: [{ ...userRow(), ...bigBody, tdee_calibration: 1 }],
        weights: [{ user_id: "user-1", date: "2026-07-15", weight_kg: 100 }],
        activity: [],
        daily_targets: [],
      },
    });
    await saveGoals({
      diet_type: "regular",
      activity_level: "moderate",
      goal_pace: "steady",
    });
    const withoutCalibration = Number(plain.db.daily_targets[0].kcal);

    expect(withCalibration).toBeLessThan(withoutCalibration);
  });

  it("keeps body fat and goal weight in the recompute", async () => {
    // Body fat switches the resting-rate equation to Katch-McArdle; dropping it
    // on a profile save silently moves the user's calorie target.
    const lean = installFakeSupabase({
      db: {
        users: [{ ...userRow(), body_fat_pct: 18, goal_weight_kg: 65 }],
        weights: [{ user_id: "user-1", date: "2026-07-15", weight_kg: 80 }],
        activity: [],
        daily_targets: [],
      },
    });
    await saveGoals({
      diet_type: "regular",
      activity_level: "moderate",
      goal_pace: "steady",
    });

    const unknown = installFakeSupabase({
      db: {
        users: [{ ...userRow(), body_fat_pct: null, goal_weight_kg: null }],
        weights: [{ user_id: "user-1", date: "2026-07-15", weight_kg: 80 }],
        activity: [],
        daily_targets: [],
      },
    });
    await saveGoals({
      diet_type: "regular",
      activity_level: "moderate",
      goal_pace: "steady",
    });

    expect(Number(lean.db.daily_targets[0].kcal)).not.toBe(
      Number(unknown.db.daily_targets[0].kcal),
    );
    // And the goal weight caps the protein basis at 65 kg, not the 80 on the scale.
    expect(Number(lean.db.daily_targets[0].protein_g)).toBe(143); // 65 kg × 1 g/lb
  });

  it("saves the profile but writes no target when there is no weigh-in yet", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [userRow()],
        weights: [],
        activity: [],
        daily_targets: [],
      },
    });

    await saveGoals({
      diet_type: "regular",
      activity_level: "light",
      goal_pace: "gentle",
    });

    expect(db.users[0].goal_pace).toBe("gentle");
    expect(db.daily_targets).toHaveLength(0);
  });
});

describe("restartCalibration", () => {
  const returning = () => ({
    users: [
      {
        ...userRow(),
        activity_level: "moderate",
        goal_pace: "steady",
        goal_weight_kg: 65,
        tdee_calibration: 0.92,
        calibration_started_at: "2025-01-06T09:00:00Z",
        estimated_maintenance_kcal: 2400,
      },
    ],
    weights: [{ user_id: "user-1", date: "2026-07-15", weight_kg: 80 }],
    activity: [],
    daily_targets: [],
  });

  it("reopens the window from today and holds this week at maintenance", async () => {
    const { db } = installFakeSupabase({ db: returning() });

    await restartCalibration();

    // The clock restarts now — the stale timestamp from the first run would leave
    // the hold already "finished" the moment it reopened.
    const startedAt = String(db.users[0].calibration_started_at);
    expect(Date.parse(startedAt)).toBeGreaterThan(Date.parse("2026-01-01"));

    expect(db.daily_targets).toHaveLength(1);
    expect(db.daily_targets[0].phase).toBe("calibration");
    expect(Number(db.daily_targets[0].kcal)).toBeGreaterThan(1200);
  });

  it("holds at more calories than the deficit it replaces", async () => {
    const cut = installFakeSupabase({ db: returning() });
    await saveGoals({
      diet_type: "regular",
      activity_level: "moderate",
      goal_pace: "steady",
    });
    const deficitKcal = Number(cut.db.daily_targets[0].kcal);

    const hold = installFakeSupabase({ db: returning() });
    await restartCalibration();
    const maintenanceKcal = Number(hold.db.daily_targets[0].kcal);

    expect(maintenanceKcal).toBeGreaterThan(deficitKcal);
  });

  it("keeps the learned calibration factor", async () => {
    // It is a measured correction to the formula, not a stale target. Wiping it
    // would drop the user back onto the textbook's guess — the very thing
    // calibrating exists to replace.
    const { db } = installFakeSupabase({ db: returning() });
    await restartCalibration();
    expect(Number(db.users[0].tdee_calibration)).toBe(0.92);
  });

  it("refreshes the maintenance baseline for today's body", async () => {
    const { db } = installFakeSupabase({ db: returning() });
    await restartCalibration();
    // The stored estimate described the weight they signed up at. After a restart
    // it must describe the one on the scale now.
    expect(Number(db.users[0].estimated_maintenance_kcal)).not.toBe(2400);
  });

  it("refuses rather than calibrating against a deficit target", async () => {
    // No weigh-in means no maintenance to hold at. Opening the window anyway
    // would leave the user "calibrating" against whatever target they had.
    const { db } = installFakeSupabase({
      db: { ...returning(), weights: [] },
    });

    await expect(restartCalibration()).rejects.toThrow(/weight/i);
    expect(db.daily_targets).toHaveLength(0);
    expect(db.users[0].calibration_started_at).toBe("2025-01-06T09:00:00Z");
  });
});
