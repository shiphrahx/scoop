import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";
import { addDaysISO } from "@/lib/time";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { setMealPortions, logPlannedMeal, unlogPlannedMeal, copyFromYesterday } =
  await import("@/app/(app)/plan/day/actions");

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
  meal_slots: ["Breakfast", "Dinner"],
  height_cm: 180,
  sex: "male",
  ...over,
});

// A pantry that can move each macro independently, with real extras on it.
const pantry = (): Row[] => [
  {
    user_id: "user-1",
    name: "Chicken Breast",
    kcal_100g: 165,
    protein_100g: 31,
    carbs_100g: 0,
    fat_100g: 3.6,
    fiber_100g: 0,
    sugar_100g: 0,
    satfat_100g: 1,
    sodium_mg_100g: 74,
    pack_size_g: null,
    quantity: null,
  },
  {
    user_id: "user-1",
    name: "Brown Rice",
    kcal_100g: 130,
    protein_100g: 2.7,
    carbs_100g: 28,
    fat_100g: 0.3,
    fiber_100g: 2,
    sugar_100g: 0.4,
    satfat_100g: 0.1,
    sodium_mg_100g: 5,
    pack_size_g: null,
    quantity: null,
  },
  {
    user_id: "user-1",
    name: "Olive Oil",
    kcal_100g: 900,
    protein_100g: 0,
    carbs_100g: 0,
    fat_100g: 100,
    fiber_100g: 0,
    sugar_100g: 0,
    satfat_100g: 14,
    sodium_mg_100g: 2,
    pack_size_g: null,
    quantity: null,
  },
];

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

describe("setMealPortions", () => {
  const plannedMeal = (): Row => ({
    id: "pm-1",
    user_id: "user-1",
    date: today(),
    slot: "Dinner",
    origin: "ai",
    name: "Chicken with Rice",
    portions: [
      { name: "Chicken Breast", grams: 200, kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7, fiber_g: 0, sugar_g: 0, satfat_g: 2, sodium_mg: 148 },
      { name: "Brown Rice", grams: 300, kcal: 390, protein_g: 8, carbs_g: 84, fat_g: 1, fiber_g: 6, sugar_g: 1, satfat_g: 0, sodium_mg: 15 },
    ],
    kcal: 720,
    protein_g: 70,
    carbs_g: 84,
    fat_g: 8,
    fiber_g: 6,
    sugar_g: 1,
    satfat_g: 2,
    sodium_mg: 163,
    logged_food_id: null,
  });

  it("re-sums the meal from the portions the user kept", async () => {
    const { db } = installFakeSupabase({ db: { planned_meals: [plannedMeal()] } });

    // The user drops the rice.
    await setMealPortions("pm-1", [
      { name: "Chicken Breast", grams: 200, kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7, fiber_g: 0, sugar_g: 0, satfat_g: 2, sodium_mg: 148 },
    ]);

    const meal = db.planned_meals[0];
    expect(meal.kcal).toBe(330);
    expect(meal.protein_g).toBe(62);
    expect(meal.carbs_g).toBe(0);
    expect(meal.name).toBe("Chicken Breast");
  });

  it("keeps the extras when a meal is edited", async () => {
    // Re-summing only the four core macros wiped fibre and sodium off any meal
    // the user touched, silently changing what the day's verdict judged.
    const { db } = installFakeSupabase({ db: { planned_meals: [plannedMeal()] } });

    await setMealPortions("pm-1", plannedMeal().portions as never);

    const meal = db.planned_meals[0];
    expect(meal.fiber_g).toBe(6);
    expect(meal.sodium_mg).toBe(163);
    expect(meal.satfat_g).toBe(2);
  });

  it("saving an untouched meal does not change its totals", async () => {
    const before = plannedMeal();
    const { db } = installFakeSupabase({ db: { planned_meals: [before] } });

    await setMealPortions("pm-1", plannedMeal().portions as never);

    const after = db.planned_meals[0];
    expect(after.kcal).toBe(720);
    expect(after.protein_g).toBe(70);
    expect(after.carbs_g).toBe(84);
    expect(after.fat_g).toBe(8);
  });

  it("clears the slot when every portion is removed", async () => {
    const { db } = installFakeSupabase({ db: { planned_meals: [plannedMeal()] } });
    await setMealPortions("pm-1", []);
    expect(db.planned_meals).toHaveLength(0);
  });

  it("will not edit someone else's meal", async () => {
    const { db } = installFakeSupabase({
      user: { id: "user-1" },
      db: { planned_meals: [{ ...plannedMeal(), user_id: "someone-else" }] },
    });

    await setMealPortions("pm-1", [
      { name: "Chicken Breast", grams: 999, kcal: 9999, protein_g: 1, carbs_g: 1, fat_g: 1 },
    ]);

    // Untouched: the filter on user_id matched nothing.
    expect(db.planned_meals[0].kcal).toBe(720);
  });
});

describe("logPlannedMeal / unlogPlannedMeal", () => {
  const meal = (over: Row = {}): Row => ({
    id: "pm-1",
    user_id: "user-1",
    date: today(),
    slot: "Dinner",
    origin: "ai",
    name: "Chicken with Rice",
    portions: [],
    kcal: 720,
    protein_g: 70,
    carbs_g: 84,
    fat_g: 8,
    fiber_g: 6,
    sugar_g: 1,
    satfat_g: 2,
    sodium_mg: 163,
    logged_food_id: null,
    ...over,
  });

  it("logs the meal's macros to today's food and marks the slot eaten", async () => {
    const { db } = installFakeSupabase({
      db: { planned_meals: [meal()], food_logs: [] },
    });

    await logPlannedMeal("pm-1");

    expect(db.food_logs).toHaveLength(1);
    expect(db.food_logs[0].kcal).toBe(720);
    expect(db.food_logs[0].fiber_g).toBe(6);
    expect(db.planned_meals[0].logged_food_id).toBe(db.food_logs[0].id);
  });

  it("does not log the same meal twice", async () => {
    const { db } = installFakeSupabase({
      db: {
        planned_meals: [meal({ logged_food_id: "already" })],
        food_logs: [],
      },
    });

    await logPlannedMeal("pm-1");
    expect(db.food_logs).toHaveLength(0);
  });

  it("will not log someone else's meal onto my day", async () => {
    // The lookup was by id alone. A guessed id would have logged another user's
    // meal into this user's food diary, moving their calories for the day.
    const { db } = installFakeSupabase({
      user: { id: "user-1" },
      db: {
        planned_meals: [meal({ user_id: "someone-else" })],
        food_logs: [],
      },
    });

    await expect(logPlannedMeal("pm-1")).rejects.toThrow(/not found/i);
    expect(db.food_logs).toHaveLength(0);
  });

  it("undoes a logged meal, removing the food entry", async () => {
    const { db } = installFakeSupabase({
      db: {
        planned_meals: [meal({ logged_food_id: "log-1" })],
        food_logs: [{ id: "log-1", user_id: "user-1", kcal: 720 }],
      },
    });

    await unlogPlannedMeal("pm-1");

    expect(db.food_logs).toHaveLength(0);
    expect(db.planned_meals[0].logged_food_id).toBeNull();
  });
});

describe("copyFromYesterday", () => {
  const yesterday = () => addDaysISO(today(), -1);

  // A meal sitting in a slot the day before the one being planned.
  const meal = (over: Row = {}): Row => ({
    id: "pm-y",
    user_id: "user-1",
    date: yesterday(),
    slot: "Dinner",
    origin: "manual",
    name: "Chicken with Rice",
    items: [{ name: "Chicken Breast", source: "pantry", grams: 200 }],
    portions: [],
    swaps: [],
    why: null,
    kcal: 720,
    protein_g: 70,
    carbs_g: 84,
    fat_g: 8,
    fiber_g: 6,
    sugar_g: 1,
    satfat_g: 2,
    sodium_mg: 163,
    logged_food_id: null,
    ...over,
  });

  it("copies yesterday's meal into today's empty slot with the same macros", async () => {
    const { db } = installFakeSupabase({
      db: { users: [profile()], planned_meals: [meal()] },
    });

    await copyFromYesterday("Dinner");

    const copy = db.planned_meals.find((m) => m.date === today() && m.slot === "Dinner")!;
    expect(copy).toBeTruthy();
    expect(copy.kcal).toBe(720);
    expect(copy.fiber_g).toBe(6);
    expect(copy.items).toEqual(meal().items);
    // The source row is left where it was.
    expect(db.planned_meals.some((m) => m.date === yesterday())).toBe(true);
  });

  it("drops the eaten mark so the copy lands as a fresh plan", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        planned_meals: [meal({ logged_food_id: "log-1" })],
      },
    });

    await copyFromYesterday("Dinner");

    const copy = db.planned_meals.find((m) => m.date === today())!;
    expect(copy.logged_food_id).toBeNull();
  });

  it("copies onto another calendar day, not just today", async () => {
    // Planning ahead: copy the day-before into a future date's slot.
    const future = addDaysISO(today(), 3);
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        planned_meals: [meal({ date: addDaysISO(future, -1) })],
      },
    });

    await copyFromYesterday("Dinner", future);

    expect(db.planned_meals.some((m) => m.date === future && m.kcal === 720)).toBe(true);
  });

  it("throws when the previous day had nothing in the slot", async () => {
    installFakeSupabase({ db: { users: [profile()], planned_meals: [] } });
    await expect(copyFromYesterday("Dinner")).rejects.toThrow(/nothing planned/i);
  });
});
