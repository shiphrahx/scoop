import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";
import type { MealPick } from "@/lib/types";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { setMealPicks, buildMyDay, setMealPortions } = await import(
  "@/app/(app)/plan/day/actions"
);

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

  it("honours a pin once, then clears it so it can't stick forever", async () => {
    // A pin (a hand-set amount saved on a pick) must hold the food through the
    // rebalance right after the edit, but not on every future build — a stale
    // pin holding a food at a fixed amount would starve out other picks and
    // push the day off target. So the build applies the pin, then consumes it.
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

    const row = db.planned_meals.find((m) => m.id === "meal-1")!;
    // The pin was honoured this build: chicken held at exactly 150 g.
    const chicken = (row.portions as Array<{ name: string; grams: number }>).find(
      (p) => p.name === "Chicken Breast",
    );
    expect(chicken?.grams).toBe(150);
    // ...and then cleared, so the next build is free to re-portion it.
    const picks = row.picks as Array<{ name: string; pinned_g: number | null }>;
    expect(picks.find((p) => p.name === "Chicken Breast")!.pinned_g).toBeNull();
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
  // pack holds — even when the pick itself carries no pack size (it was scanned
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
    // row is "Silken Tofu". They're the same food — the cap must still find it.
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
    // rebalance. Rebalance re-solves from the picks — but must never push tofu
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
    expect(item.grams).toBe(250); // within the 300 g pack — left as set
    expect(Number(manual.kcal)).toBe(340);
  });
});
