import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";
import type { MealPick } from "@/lib/types";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { setMealPicks, buildMyDay, setMealPortions, applyDayFix, applyDaySwap } =
  await import("@/app/(app)/plan/day/actions");
const { computeDayFix } = await import("@/lib/mealplan");

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
    const total = meals.reduce<{
      kcal: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    }>(
      (s, m) => ({
        kcal: s.kcal + Number(m.kcal),
        protein_g: s.protein_g + Number(m.protein_g),
        carbs_g: s.carbs_g + Number(m.carbs_g),
        fat_g: s.fat_g + Number(m.fat_g),
      }),
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
    // Energy is what the plan is built to land on; the macros follow it.
    expect(Math.abs(total.kcal - 2000)).toBeLessThanOrEqual(50);
    expect(Math.abs(total.protein_g - 150)).toBeLessThanOrEqual(10);
    expect(Math.abs(total.carbs_g - 200)).toBeLessThanOrEqual(10);
    expect(Math.abs(total.fat_g - 65)).toBeLessThanOrEqual(8);
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
    // 65-12 fat. Three foods can only carry so much of it in sensible servings,
    // so the meal comes close and says where it lands.
    expect(Math.abs(Number(dinner.protein_g) - 120)).toBeLessThanOrEqual(12);
    expect(Math.abs(Number(dinner.carbs_g) - 130)).toBeLessThanOrEqual(35);
    expect(Math.abs(Number(dinner.fat_g) - 53)).toBeLessThanOrEqual(8);
  });

  it("carries the pantry's fibre, sugar, saturates and sodium onto the plan", async () => {
    // The day page judges the plan against fibre and sodium targets; writing
    // zeros here would paint every built day's verdict red.
    const ricePantry = {
      ...pantryRow("Brown Rice", 130, 2.7, 28, 0.3),
      fiber_100g: 2,
      sugar_100g: 0.4,
      satfat_100g: 0.1,
      sodium_mg_100g: 5,
    };
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [ricePantry, pantryRow("Chicken Breast", 165, 31, 0, 3.6)],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "",
            items: [],
            picks: [pick("Brown Rice", 130, 2.7, 28, 0.3), chickenPick()],
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

    const meal = db.planned_meals[0];
    expect(Number(meal.fiber_g)).toBeGreaterThan(0);
    expect(Number(meal.sodium_mg)).toBeGreaterThan(0);
    const portions = meal.portions as Array<{ fiber_g?: number }>;
    expect(portions.some((p) => Number(p.fiber_g) > 0)).toBe(true);
  });

  it("refuses to build before onboarding has set a target", async () => {
    installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: [], // none yet
        food_logs: [],
        pantry_items: [],
        planned_meals: [],
      },
    });
    await expect(buildMyDay()).rejects.toThrow(/onboarding/i);
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

  it("still serves the picks when the day is already eaten, and says it's over", async () => {
    // The whole day is already eaten, no budget left for the picked meal.
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
    // The pasta is still served, dropping a pick is not the planner's call, and
    // the note says the day ends up over target.
    expect((row.portions as { name: string }[]).map((p) => p.name)).toEqual(["Pasta"]);
    expect(String(row.why)).toMatch(/over today's target/i);
  });

  it("holds a pinned food on every rebalance, not just the first", async () => {
    // A pin (a hand-set amount saved on a pick) is the user's own figure, and
    // the app never overwrites one. Pins used to be spent by the build that
    // honoured them, so pressing Rebalance twice silently undid the edit.
    // Releasing a hold is the user's call, made in the meal editor.
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [
          pantryRow("Chicken Breast", 165, 31, 0, 3.6),
          pantryRow("Pasta", 371, 13, 71, 1.5),
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
            picks: [{ ...chickenPick(), pinned_g: 150 }, pastaPick()],
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
    await buildMyDay();

    const row = db.planned_meals.find((m) => m.id === "meal-1")!;
    // Chicken is still at exactly the 150 g the user set, two rebalances later.
    const chicken = (row.portions as Array<{ name: string; grams: number }>).find(
      (p) => p.name === "Chicken Breast",
    );
    expect(chicken?.grams).toBe(150);
    // And the pin survives, so it will hold on the next build too.
    const picks = row.picks as Array<{ name: string; pinned_g: number | null }>;
    expect(picks.find((p) => p.name === "Chicken Breast")!.pinned_g).toBe(150);
  });

  it("sizes a free pick while holding a hand-set one in the same meal", async () => {
    // The user's flow: a snack already holds a cereal bar at the amount they set
    // (pinned), and they add protein powder for the app to portion (free). The
    // build must keep the bar at its amount and work out a real serving of powder.
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [
          pantryRow("Cereal Bar", 400, 6, 65, 12),
          pantryRow("Protein Powder", 380, 80, 8, 6),
        ],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Breakfast",
            origin: "ai",
            name: "",
            items: [],
            picks: [
              { ...pick("Cereal Bar", 400, 6, 65, 12), pinned_g: 40 },
              pick("Protein Powder", 380, 80, 8, 6),
            ],
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

    const portions = db.planned_meals[0].portions as { name: string; grams: number }[];
    const bar = portions.find((p) => p.name === "Cereal Bar")!;
    const powder = portions.find((p) => p.name === "Protein Powder")!;
    expect(bar.grams).toBe(40); // held where the user set it
    expect(powder.grams).toBeGreaterThan(0); // the app worked out a serving
  });

  it("reports what it moved, and what held it back", async () => {
    // A rebalance that changes nothing is a real answer, but silence reads as a
    // broken button, so the action says what moved, or which held food stopped
    // anything moving.
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [
          pantryRow("Chicken Breast", 165, 31, 0, 3.6),
          pantryRow("Pasta", 371, 13, 71, 1.5),
        ],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "",
            items: [],
            picks: [{ ...chickenPick(), pinned_g: 150 }, pastaPick()],
            portions: [{ name: "Chicken Breast", grams: 150 }],
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

    const first = await buildMyDay();
    // Pasta was not portioned before, so it shows as a move; the held chicken is
    // named so the user can see what the solve had to work around.
    expect(first.changed).toBe(true);
    expect(first.moves.join(" ")).toMatch(/Pasta/);
    expect(first.held).toContain("Chicken Breast");
    expect(db.planned_meals).toHaveLength(1);

    // Second press: still held. Only the user releases a hold.
    const second = await buildMyDay();
    expect(second.held).toContain("Chicken Breast");
  });

  it("offers to drop an over-fat pick, and applies the fix on request", async () => {
    // The whole fat budget is already eaten, but the user picked olive oil for
    // dinner. The oil can't be portioned below its floor, so the day is stuck
    // over fat: buildMyDay must hand back a fix (drop the oil), and applyDayFix
    // must carry it out and re-portion the day around what's left.
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        // 63 g of fat already eaten (of 65), only the calories, so protein and
        // carbs still have all their room.
        food_logs: [
          {
            user_id: "user-1",
            logged_at: new Date().toISOString(),
            kcal: 567,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 63,
          },
        ],
        pantry_items: [
          pantryRow("Olive Oil", 900, 0, 0, 100),
          pantryRow("Pasta", 371, 13, 71, 1.5),
          pantryRow("Chicken Breast", 165, 31, 0, 3.6),
        ],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "",
            items: [],
            picks: [oilPick(), pastaPick(), chickenPick()],
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

    const first = await buildMyDay();
    expect(first.fix).toBeTruthy();
    expect(first.fix!.drops.some((d) => /oil/i.test(d.name))).toBe(true);
    // Oil is on the plate before the fix.
    const built = db.planned_meals[0].portions as { name: string }[];
    expect(built.some((p) => /oil/i.test(p.name))).toBe(true);

    const second = await applyDayFix(first.fix!.drops);
    // Oil gone, day re-portioned; no fat-dominant food left to drop, so no
    // further fix is offered.
    const portions = db.planned_meals[0].portions as { name: string }[];
    expect(portions.some((p) => /oil/i.test(p.name))).toBe(false);
    expect(portions.length).toBeGreaterThan(0);
    expect(second.fix).toBeNull();
  });

  it("offers no fix when the day lands within its ceilings", async () => {
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

    const r = await buildMyDay();
    expect(r.fix).toBeNull();
    void db;
  });

  it("doesn't offer to drop a food over the few grams that filled the day", async () => {
    // The planner may put a macro a little over to fill the day's calories. That
    // is not a stuck day: prompting to drop the oil would hand back the calories
    // the trade just bought, over a sentence ("these picks can't be portioned any
    // smaller") that isn't true. Reported as a rebalance that did nothing.
    const budget = { kcal: 1720, protein_g: 120, carbs_g: 215, fat_g: 42 };
    const meals = [
      {
        slot: "Dinner",
        portions: [
          { name: "Extra Virgin Olive Oil", grams: 12, kcal: 108, protein_g: 0, carbs_g: 0, fat_g: 12 },
          { name: "Basmati Rice", grams: 400, kcal: 1600, protein_g: 110, carbs_g: 214, fat_g: 35 },
        ],
        kcal: 1708,
        protein_g: 110,
        carbs_g: 214,
        fat_g: 47,
      },
    ];
    expect(computeDayFix(meals, budget)).toBeNull();

    // Same overshoot on a day still hundreds of calories short IS worth a prompt:
    // dropping the oil is what frees the room to fill it.
    const short = [{ ...meals[0], kcal: 1200, protein_g: 70, carbs_g: 150 }];
    const fix = computeDayFix(short, budget);
    expect(fix).toBeTruthy();
    expect(fix!.drops.some((d) => /oil/i.test(d.name))).toBe(true);

    // And a big overshoot is still flagged even when the calories land.
    const fatty = [{ ...meals[0], fat_g: 60 }];
    expect(computeDayFix(fatty, budget)).toBeTruthy();
  });

  it("offers a pantry swap when the picks can't reach the day, and applies it", async () => {
    // The picked rice has 77 g left in the pack, so the day's carbs can't grow
    // and the plan lands hundreds of calories short. There's a full bag of pasta
    // in the pantry: the build must say so, and applyDaySwap must trade the one
    // food and re-portion around it.
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [
          { ...pantryRow("White Rice", 130, 2.7, 28, 0.3), pack_size_g: 77, quantity: 1 },
          { ...pantryRow("Pasta", 371, 13, 71, 1.5), pack_size_g: 500, quantity: 1 },
          pantryRow("Chicken Breast", 165, 31, 0, 3.6),
        ],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "",
            items: [],
            picks: [chickenPick(), pick("White Rice", 130, 2.7, 28, 0.3)],
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

    const first = await buildMyDay();
    expect(first.fix).toBeNull();
    expect(first.swap).toBeTruthy();
    expect(first.swap!.slot).toBe("Dinner");
    expect(first.swap!.from).toBe("White Rice");
    expect(first.swap!.to).toBe("Pasta");

    const second = await applyDaySwap(first.swap!);
    const picks = db.planned_meals[0].picks as MealPick[];
    expect(picks.map((p) => p.name)).toEqual(["Chicken Breast", "Pasta"]);
    const portions = db.planned_meals[0].portions as { name: string }[];
    expect(portions.some((p) => p.name === "Pasta")).toBe(true);
    expect(portions.some((p) => p.name === "White Rice")).toBe(false);
    // And the swapped day really is closer to the target than the picked one.
    expect(Math.abs(second.landed.kcal - second.budget.kcal)).toBeLessThan(
      Math.abs(first.landed.kcal - first.budget.kcal),
    );
  });

  it("offers no swap when the picks already land the day", async () => {
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
        ],
        planned_meals: [
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

    const r = await buildMyDay();
    expect(r.swap).toBeNull();
    void db;
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

  // A 300 g pack of tofu in the pantry, picked into a meal that wants far more
  // protein than a pack can give. The build must never portion more than the
  // pack holds, even when the pick itself carries no pack size (it was scanned
  // before we knew, or added by chip), because we read the pantry's pack now.
  const tofuPackRow = (): Row => ({
    ...pantryRow("Tofu", 136, 14, 2, 8),
    pack_size_g: 300,
    quantity: 1,
    off_barcode: "5000000000000",
  });

  it("never portions a picked food past the pantry's pack size", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [tofuPackRow(), pantryRow("Pasta", 371, 13, 71, 1.5)],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "",
            items: [],
            // The tofu pick has no pack size of its own (source "off": scanned,
            // OFF gave no pack): only the pantry row knows it's a 300 g pack.
            // Old code left an "off" pick uncapped and clamped it to the 350 g
            // protein ceiling.
            picks: [pick("Tofu", 136, 14, 2, 8, "off"), pastaPick()],
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

    const portions = db.planned_meals[0].portions as { name: string; grams: number }[];
    const tofu = portions.find((p) => p.name === "Tofu");
    expect(tofu).toBeDefined();
    expect(tofu!.grams).toBeLessThanOrEqual(300);
  });

  it("recalculates an over-pack meal when rebalanced, honouring the pack size", async () => {
    // A meal already 'built' with a stale 350 g tofu portion (over the 300 g
    // pack). Rebalance = buildMyDay again: it must re-solve from the picks and
    // bring tofu back within the pack, not leave the stale portion in place.
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [tofuPackRow(), pantryRow("Pasta", 371, 13, 71, 1.5)],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "Tofu with Pasta",
            items: [],
            picks: [pick("Tofu", 136, 14, 2, 8, "off"), pastaPick()],
            portions: [
              { name: "Tofu", grams: 350, kcal: 476, protein_g: 49, carbs_g: 7, fat_g: 28 },
              { name: "Pasta", grams: 200, kcal: 742, protein_g: 26, carbs_g: 142, fat_g: 3 },
            ],
            swaps: [],
            why: null,
            kcal: 1218,
            protein_g: 75,
            carbs_g: 149,
            fat_g: 31,
            logged_food_id: null,
          },
        ],
      },
    });

    await buildMyDay();

    const meal = db.planned_meals[0];
    const portions = meal.portions as { name: string; grams: number }[];
    const tofu = portions.find((p) => p.name === "Tofu");
    expect(tofu).toBeDefined();
    expect(tofu!.grams).not.toBe(350); // the stale portion was recomputed
    expect(tofu!.grams).toBeLessThanOrEqual(300);
  });

  // A hand-built (manual) meal holding 350 g of tofu cut from a 300 g pack. The
  // day solver never re-portions manual meals, but rebalance must still bring
  // the over-pack serving back within the pack and re-sum the meal.
  const manualTofuItem = (grams: number): Row => ({
    name: "Tofu",
    source: "pantry",
    off_barcode: null,
    grams,
    kcal_100g: 136,
    protein_100g: 14,
    carbs_100g: 2,
    fat_100g: 8,
    fiber_100g: 0,
    sugar_100g: 0,
    satfat_100g: 0,
    sodium_mg_100g: 0,
    unit_g: null,
    unit_label: null,
  });

  it("clamps a hand-built meal's serving to the pantry pack on rebalance", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [
          tofuPackRow(),
          pantryRow("Pasta", 371, 13, 71, 1.5),
          pantryRow("Chicken Breast", 165, 31, 0, 3.6),
        ],
        planned_meals: [
          {
            id: "meal-manual",
            user_id: "user-1",
            date: today(),
            slot: "Breakfast",
            origin: "manual",
            name: "Tofu",
            items: [manualTofuItem(350)],
            picks: [],
            portions: [],
            swaps: [],
            why: null,
            kcal: 476,
            protein_g: 49,
            carbs_g: 7,
            fat_g: 28,
            logged_food_id: null,
          },
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "",
            items: [],
            picks: [pastaPick(), chickenPick()],
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

    const manual = db.planned_meals.find((m) => m.id === "meal-manual")!;
    const item = (manual.items as { name: string; grams: number }[]).find(
      (i) => i.name === "Tofu",
    )!;
    expect(item.grams).toBe(300); // one pack, not 350
    expect(Number(manual.kcal)).toBe(408); // 136 kcal/100g × 300 g, re-summed
    expect(Number(manual.protein_g)).toBe(42);
  });

  it("caps a picked food when its name differs from the pantry only in case/spacing", async () => {
    // The pick was saved as "silken  tofu" (lowercase, double space); the pantry
    // row is "Silken Tofu". They're the same food, the cap must still find it.
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [
          { ...pantryRow("Silken Tofu", 136, 14, 2, 8), pack_size_g: 300, quantity: 1 },
          pantryRow("Pasta", 371, 13, 71, 1.5),
        ],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "",
            items: [],
            picks: [pick("silken  tofu", 136, 14, 2, 8, "off"), pastaPick()],
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

    const portions = db.planned_meals[0].portions as { name: string; grams: number }[];
    const tofu = portions.find((p) => /tofu/i.test(p.name));
    expect(tofu).toBeDefined();
    expect(tofu!.grams).toBeLessThanOrEqual(300);
  });

  it("caps a picked food by its own pack size when it isn't in the pantry", async () => {
    // The tofu was scanned into the meal but never saved to the pantry, so the
    // only pack size known is the one on the pick itself. It must still cap.
    const tofuWithPack: MealPick = { ...pick("Tofu", 136, 14, 2, 8, "off"), pack_size_g: 300 };
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [pantryRow("Pasta", 371, 13, 71, 1.5)],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "",
            items: [],
            picks: [tofuWithPack, pastaPick()],
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

    const portions = db.planned_meals[0].portions as { name: string; grams: number }[];
    const tofu = portions.find((p) => p.name === "Tofu")!;
    expect(tofu.grams).toBeLessThanOrEqual(300);
  });

  it("never portions a single serving past one pack, even with several in stock", async () => {
    // Three 300 g packs (900 g stock), but a single meal must not plate more
    // than one pack: the pick's own 300 g pack is the tighter cap.
    const tofuWithPack: MealPick = { ...pick("Tofu", 136, 14, 2, 8), pack_size_g: 300 };
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [
          { ...pantryRow("Tofu", 136, 14, 2, 8), pack_size_g: 300, quantity: 3 },
          pantryRow("Pasta", 371, 13, 71, 1.5),
        ],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "",
            items: [],
            picks: [tofuWithPack, pastaPick()],
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

    const portions = db.planned_meals[0].portions as { name: string; grams: number }[];
    const tofu = portions.find((p) => p.name === "Tofu")!;
    expect(tofu.grams).toBeLessThanOrEqual(300);
  });

  it("a dish portion lowered by hand never rebounds above the pack on rebalance", async () => {
    // The exact user flow: build a picked meal, tap Edit and lower tofu, then
    // rebalance. Rebalance re-solves from the picks, but must never push tofu
    // back above its 300 g pack (previously it rebounded to the 350 g protein
    // ceiling because the pack cap wasn't reaching the solve).
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [tofuPackRow(), pantryRow("Pasta", 371, 13, 71, 1.5)],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "Tofu with Pasta",
            items: [],
            picks: [pick("Tofu", 136, 14, 2, 8, "off"), pastaPick()],
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

    // Build, then the user edits the dish down to 300 g of tofu…
    await buildMyDay();
    await setMealPortions("meal-1", [
      { name: "Tofu", grams: 300, kcal: 408, protein_g: 42, carbs_g: 6, fat_g: 24 },
      { name: "Pasta", grams: 150, kcal: 557, protein_g: 20, carbs_g: 107, fat_g: 2 },
    ]);
    // …and rebalances again.
    await buildMyDay();

    const portions = db.planned_meals[0].portions as { name: string; grams: number }[];
    const tofu = portions.find((p) => p.name === "Tofu")!;
    expect(tofu.grams).not.toBe(350);
    expect(tofu.grams).toBeLessThanOrEqual(300);
  });

  it("never re-portions a hand-edited food, however many times you rebalance", async () => {
    // Issue #58: the user sets tofu to 220 g in the editor and presses Rebalance.
    // The first press held it, but spent the pin doing so, so the second press
    // re-solved tofu and wiped the edit. A hand-set amount is the user's, and the
    // rebalance works around it, the other foods are what move.
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [tofuPackRow(), pantryRow("Pasta", 371, 13, 71, 1.5)],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "Tofu with Pasta",
            items: [],
            picks: [pick("Tofu", 136, 14, 2, 8, "off"), pastaPick()],
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
    // The user re-weighs the tofu and leaves the pasta to the app.
    await setMealPortions(
      "meal-1",
      [
        { name: "Tofu", grams: 220, kcal: 299, protein_g: 31, carbs_g: 4, fat_g: 18 },
        { name: "Pasta", grams: 150, kcal: 557, protein_g: 20, carbs_g: 107, fat_g: 2 },
      ],
      ["Tofu"],
    );

    const gramsOfTofu = () =>
      (db.planned_meals[0].portions as { name: string; grams: number }[]).find(
        (p) => p.name === "Tofu",
      )!.grams;

    await buildMyDay();
    expect(gramsOfTofu()).toBe(220);
    await buildMyDay();
    expect(gramsOfTofu()).toBe(220);
  });

  it("leaves a hand-built meal within its pack untouched on rebalance", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [tofuPackRow(), pantryRow("Pasta", 371, 13, 71, 1.5)],
        planned_meals: [
          {
            id: "meal-manual",
            user_id: "user-1",
            date: today(),
            slot: "Breakfast",
            origin: "manual",
            name: "Tofu",
            items: [manualTofuItem(250)],
            picks: [],
            portions: [],
            swaps: [],
            why: null,
            kcal: 340,
            protein_g: 35,
            carbs_g: 5,
            fat_g: 20,
            logged_food_id: null,
          },
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "",
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

    const manual = db.planned_meals.find((m) => m.id === "meal-manual")!;
    const item = (manual.items as { name: string; grams: number }[]).find(
      (i) => i.name === "Tofu",
    )!;
    expect(item.grams).toBe(250); // within the 300 g pack, left as set
    expect(Number(manual.kcal)).toBe(340);
  });
});
