import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";
import { addDaysISO } from "@/lib/time";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { planMyDay, setMealPortions, logPlannedMeal, unlogPlannedMeal, copyFromYesterday } =
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

describe("planMyDay", () => {
  it("fills the empty slots from the pantry and lands on the day's macros", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        pantry_items: pantry(),
        daily_targets: targets(),
        food_logs: [],
        planned_meals: [],
      },
    });

    await planMyDay();

    expect(db.planned_meals).toHaveLength(2);
    const total = db.planned_meals.reduce<{
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    }>(
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

  it("carries the pantry's fibre, sugar, saturates and sodium onto the plan", async () => {
    // These used to be written as 0. The day page judges the plan against the
    // user's fibre and sodium targets, so a zero here reads as a total miss and
    // paints the day's verdict red however good the plan is.
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        pantry_items: pantry(),
        daily_targets: targets(),
        food_logs: [],
        planned_meals: [],
      },
    });

    await planMyDay();

    const fibre = db.planned_meals.reduce((s, m) => s + Number(m.fiber_g), 0);
    const sodium = db.planned_meals.reduce((s, m) => s + Number(m.sodium_mg), 0);
    const satfat = db.planned_meals.reduce((s, m) => s + Number(m.satfat_g), 0);
    // The rice alone carries 2 g fibre/100 g and the day plans hundreds of grams.
    expect(fibre).toBeGreaterThan(0);
    expect(sodium).toBeGreaterThan(0);
    expect(satfat).toBeGreaterThan(0);

    // And the portions carry their own share, so an edit can rescale them.
    const portions = db.planned_meals.flatMap((m) => m.portions as Row[]);
    expect(portions.some((p) => Number(p.fiber_g) > 0)).toBe(true);
  });

  it("budgets around a meal the user already planned", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        pantry_items: pantry(),
        daily_targets: targets(),
        food_logs: [],
        planned_meals: [
          {
            id: "pm-1",
            user_id: "user-1",
            date: today(),
            slot: "Breakfast",
            origin: "manual",
            name: "Porridge",
            portions: [],
            kcal: 500,
            protein_g: 100,
            carbs_g: 60,
            fat_g: 20,
            fiber_g: 5,
            sugar_g: 5,
            satfat_g: 2,
            sodium_mg: 100,
            logged_food_id: null,
          },
        ],
      },
    });

    await planMyDay();

    // Only Dinner was empty, so only Dinner gets planned...
    const dinner = db.planned_meals.find((m) => m.slot === "Dinner")!;
    expect(dinner).toBeDefined();
    // ...and it takes only what the porridge left (≈50 g protein, not 150).
    expect(Number(dinner.protein_g)).toBeLessThan(60);
    // The meal the user built is untouched.
    const breakfast = db.planned_meals.find((m) => m.slot === "Breakfast")!;
    expect(breakfast.name).toBe("Porridge");
    expect(breakfast.origin).toBe("manual");
  });

  it("leaves out food the user's diet, allergies or dislikes rule out", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile({ diet_type: "vegetarian", dislikes: ["Olive Oil"] })],
        pantry_items: pantry(),
        daily_targets: targets(),
        food_logs: [],
        planned_meals: [],
      },
    });

    await planMyDay();

    const names = db.planned_meals
      .flatMap((m) => m.portions as Row[])
      .map((p) => String(p.name));
    expect(names).not.toContain("Chicken Breast"); // not vegetarian
    expect(names).not.toContain("Olive Oil"); // disliked
  });

  it("refuses to plan before onboarding has set a target", async () => {
    installFakeSupabase({
      db: {
        users: [profile()],
        pantry_items: pantry(),
        daily_targets: [], // none yet
        food_logs: [],
        planned_meals: [],
      },
    });

    await expect(planMyDay()).rejects.toThrow(/onboarding/i);
  });
});

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
