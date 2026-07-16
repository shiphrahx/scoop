import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";
import { isEncrypted } from "@/lib/crypto";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { saveApiKey, clearApiKey, saveGoals, saveMealSlots, saveNutrientPrefs } =
  await import("@/app/(app)/me/actions");

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
