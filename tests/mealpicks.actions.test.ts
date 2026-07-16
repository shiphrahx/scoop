import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";
import type { MealPick } from "@/lib/types";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { setMealPicks, buildMyDay } = await import("@/app/(app)/plan/day/actions");

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const profile = (over: Row = {}): Row => ({
  id: "user-1",
  diet_type: "regular",
  allergies: [],
  dislikes: [],
  meal_slots: ["Breakfast", "Lunch", "Dinner"],
  slot_weights: {},
  height_cm: 180,
  sex: "male",
  ...over,
});

const targets = (): Row[] => [
  {
    user_id: "user-1",
    week_start: "2000-01-03",
    kcal: 2000,
    protein_g: 150,
    carbs_g: 200,
    fat_g: 65,
    fiber_g: 28,
    sugar_g: 50,
    satfat_g: 22,
    sodium_mg: 2300,
  },
];

// Pantry rows for foods the picks name, so the build reads current numbers.
const pantryRow = (
  name: string,
  kcal: number,
  p: number,
  c: number,
  f: number,
): Row => ({
  user_id: "user-1",
  name,
  kcal_100g: kcal,
  protein_100g: p,
  carbs_100g: c,
  fat_100g: f,
  fiber_100g: 0,
  sugar_100g: 0,
  satfat_100g: 0,
  sodium_mg_100g: 0,
  pack_size_g: null,
  quantity: null,
});

const pick = (
  name: string,
  kcal: number,
  p: number,
  c: number,
  f: number,
  source: "pantry" | "off" = "pantry",
): MealPick => ({
  name,
  source,
  off_barcode: null,
  kcal_100g: kcal,
  protein_100g: p,
  carbs_100g: c,
  fat_100g: f,
  fiber_100g: 0,
  sugar_100g: 0,
  satfat_100g: 0,
  sodium_mg_100g: 0,
  pack_size_g: null,
});

const chickenPick = () => pick("Chicken Breast", 165, 31, 0, 3.6);
const pastaPick = () => pick("Pasta", 371, 13, 71, 1.5);
const oilPick = () => pick("Olive Oil", 900, 0, 0, 100);
const bagelPick = () => pick("Bagel", 264, 10, 49, 2);
const tofuPick = () => pick("Tofu", 136, 14, 2, 8);

describe("setMealPicks", () => {
  it("saves the picks as an unbuilt meal for the slot", async () => {
    const { db } = installFakeSupabase({
      db: { users: [profile()], planned_meals: [] },
    });

    await setMealPicks("Lunch", [pastaPick(), oilPick()]);

    expect(db.planned_meals).toHaveLength(1);
    const row = db.planned_meals[0];
    expect(row.slot).toBe("Lunch");
    expect(row.origin).toBe("ai");
    expect(row.user_id).toBe("user-1");
    expect((row.picks as MealPick[]).map((p) => p.name)).toEqual([
      "Pasta",
      "Olive Oil",
    ]);
    expect(row.portions).toEqual([]); // no grams until "Build my day"
    expect(row.kcal).toBe(0);
  });

  it("replaces earlier picks and resets any solved portions", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Lunch",
            origin: "ai",
            name: "Pasta",
            items: [],
            picks: [pastaPick()],
            portions: [{ name: "Pasta", grams: 120 }],
            swaps: [],
            why: null,
            kcal: 445,
            protein_g: 16,
            carbs_g: 85,
            fat_g: 2,
            logged_food_id: null,
          },
        ],
      },
    });

    await setMealPicks("Lunch", [bagelPick(), tofuPick()]);

    expect(db.planned_meals).toHaveLength(1);
    const row = db.planned_meals[0];
    expect((row.picks as MealPick[]).map((p) => p.name)).toEqual(["Bagel", "Tofu"]);
    expect(row.portions).toEqual([]); // the old solve was for the old picks
    expect(row.kcal).toBe(0);
  });

  it("clears the slot when handed no picks", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Lunch",
            origin: "ai",
            picks: [pastaPick()],
            portions: [],
            logged_food_id: null,
          },
        ],
      },
    });

    await setMealPicks("Lunch", []);
    expect(db.planned_meals).toHaveLength(0);
  });

  it("refuses to touch a meal that is already logged", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Lunch",
            origin: "ai",
            picks: [],
            portions: [],
            logged_food_id: "log-1",
          },
        ],
      },
    });

    await expect(setMealPicks("Lunch", [pastaPick()])).rejects.toThrow(/logged/i);
    expect(db.planned_meals).toHaveLength(1);
  });

  it("rejects a pick with impossible macros", async () => {
    installFakeSupabase({ db: { users: [profile()], planned_meals: [] } });
    const bad = { ...pastaPick(), protein_100g: 900 };
    await expect(setMealPicks("Lunch", [bad])).rejects.toThrow(/Pasta/);
  });
});

describe("buildMyDay", () => {
  it("portions every picked meal so the day lands on the target", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [
          pantryRow("Chicken Breast", 165, 31, 0, 3.6),
          pantryRow("Pasta", 371, 13, 71, 1.5),
          pantryRow("Olive Oil", 900, 0, 0, 100),
          pantryRow("Bagel", 264, 10, 49, 2),
          pantryRow("Tofu", 136, 14, 2, 8),
        ],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Lunch",
            origin: "ai",
            name: "",
            items: [],
            picks: [pastaPick(), chickenPick(), oilPick()],
            portions: [],
            swaps: [],
            why: null,
            kcal: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            logged_food_id: null,
          },
          {
            id: "meal-2",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "",
            items: [],
            picks: [bagelPick(), tofuPick(), oilPick()],
            portions: [],
            swaps: [],
            why: null,
            kcal: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            logged_food_id: null,
          },
        ],
      },
    });

    await buildMyDay();

    const meals = db.planned_meals;
    expect(meals).toHaveLength(2);
    for (const m of meals) {
      expect((m.portions as { grams: number }[]).length).toBeGreaterThan(0);
    }
    const total = meals.reduce<{ protein_g: number; carbs_g: number; fat_g: number }>(
      (s, m) => ({
        protein_g: s.protein_g + Number(m.protein_g),
        carbs_g: s.carbs_g + Number(m.carbs_g),
        fat_g: s.fat_g + Number(m.fat_g),
      }),
      { protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
    expect(Math.abs(total.protein_g - 150)).toBeLessThanOrEqual(5);
    expect(Math.abs(total.carbs_g - 200)).toBeLessThanOrEqual(5);
    expect(Math.abs(total.fat_g - 65)).toBeLessThanOrEqual(5);
  });

  it("budgets around hand-built meals instead of re-solving them", async () => {
    const manual = {
      id: "meal-manual",
      user_id: "user-1",
      date: today(),
      slot: "Breakfast",
      origin: "manual",
      name: "My porridge",
      items: [],
      picks: [],
      portions: [],
      swaps: [],
      why: null,
      kcal: 500,
      protein_g: 30,
      carbs_g: 70,
      fat_g: 12,
      logged_food_id: null,
    };
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [
          pantryRow("Chicken Breast", 165, 31, 0, 3.6),
          pantryRow("Pasta", 371, 13, 71, 1.5),
          pantryRow("Olive Oil", 900, 0, 0, 100),
        ],
        planned_meals: [
          manual,
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "",
            items: [],
            picks: [pastaPick(), chickenPick(), oilPick()],
            portions: [],
            swaps: [],
            why: null,
            kcal: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            logged_food_id: null,
          },
        ],
      },
    });

    await buildMyDay();

    const kept = db.planned_meals.find((m) => m.id === "meal-manual")!;
    expect(kept.kcal).toBe(500); // untouched
    const dinner = db.planned_meals.find((m) => m.id === "meal-1")!;
    // Dinner takes what the manual meal left: 150-30 protein, 200-70 carbs,
    // 65-12 fat.
    expect(Math.abs(Number(dinner.protein_g) - 120)).toBeLessThanOrEqual(5);
    expect(Math.abs(Number(dinner.carbs_g) - 130)).toBeLessThanOrEqual(5);
    expect(Math.abs(Number(dinner.fat_g) - 53)).toBeLessThanOrEqual(5);
  });

  it("throws when nothing has picks yet", async () => {
    installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [],
        planned_meals: [],
      },
    });
    await expect(buildMyDay()).rejects.toThrow(/pick foods/i);
  });

  it("keeps the picks and explains when a meal cannot fit", async () => {
    // The whole day is already eaten — no budget left for the picked meal.
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [
          {
            user_id: "user-1",
            logged_at: new Date().toISOString(),
            kcal: 2000,
            protein_g: 150,
            carbs_g: 200,
            fat_g: 65,
          },
        ],
        pantry_items: [pantryRow("Pasta", 371, 13, 71, 1.5)],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "Pasta",
            items: [],
            picks: [pastaPick()],
            portions: [],
            swaps: [],
            why: null,
            kcal: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            logged_food_id: null,
          },
        ],
      },
    });

    await buildMyDay();

    const row = db.planned_meals[0];
    expect((row.picks as MealPick[]).length).toBe(1); // picks survive
    expect(row.portions).toEqual([]);
    expect(String(row.why)).toMatch(/no room/i);
  });

  it("sizes meals by the profile's slot weights", async () => {
    const mkMeal = (id: string, slot: string): Row => ({
      id,
      user_id: "user-1",
      date: today(),
      slot,
      origin: "ai",
      name: "",
      items: [],
      picks: [pastaPick(), chickenPick(), oilPick()],
      portions: [],
      swaps: [],
      why: null,
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      logged_food_id: null,
    });
    const { db } = installFakeSupabase({
      db: {
        users: [profile({ slot_weights: { Lunch: 25, Dinner: 75 } })],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [
          pantryRow("Chicken Breast", 165, 31, 0, 3.6),
          pantryRow("Pasta", 371, 13, 71, 1.5),
          pantryRow("Olive Oil", 900, 0, 0, 100),
        ],
        planned_meals: [mkMeal("meal-1", "Lunch"), mkMeal("meal-2", "Dinner")],
      },
    });

    await buildMyDay();

    const lunch = db.planned_meals.find((m) => m.slot === "Lunch")!;
    const dinner = db.planned_meals.find((m) => m.slot === "Dinner")!;
    expect(Number(dinner.kcal)).toBeGreaterThan(Number(lunch.kcal) * 2);
  });
});
