import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";
import type { MealPick } from "@/lib/types";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { buildMyDay } = await import("@/app/(app)/plan/day/actions");

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const profile = (slots: string[]): Row => ({
  id: "user-1",
  diet_type: "regular",
  allergies: [],
  dislikes: [],
  meal_slots: slots,
  slot_weights: {},
  height_cm: 170,
  sex: "female",
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

// A pantry row as the app stores it, with the serving preset a scanned/known
// product carries (unit_g / unit_label).
const item = (
  name: string,
  kcal: number,
  p: number,
  c: number,
  f: number,
  extra: Row = {},
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
  unit_g: null,
  unit_label: null,
  ...extra,
});

const pickOf = (row: Row): MealPick => ({
  name: row.name as string,
  source: "pantry",
  off_barcode: null,
  kcal_100g: row.kcal_100g as number,
  protein_100g: row.protein_100g as number,
  carbs_100g: row.carbs_100g as number,
  fat_100g: row.fat_100g as number,
  fiber_100g: 0,
  sugar_100g: 0,
  satfat_100g: 0,
  sodium_mg_100g: 0,
  pack_size_g: null,
  unit_g: (row.unit_g as number | null) ?? null,
  unit_label: (row.unit_label as string | null) ?? null,
});

const meal = (id: string, slot: string, picks: MealPick[]): Row => ({
  id,
  user_id: "user-1",
  date: today(),
  slot,
  origin: "ai",
  name: "",
  items: [],
  picks,
  portions: [],
  swaps: [],
  why: null,
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  logged_food_id: null,
});

const portionsOf = (db: { planned_meals: Row[] }, slot: string) =>
  (db.planned_meals.find((x) => x.slot === slot)!.portions as {
    name: string;
    grams: number;
  }[]);

const gramsIn = (db: { planned_meals: Row[] }, slot: string, name: string) =>
  portionsOf(db, slot).find((p) => p.name === name)?.grams ?? 0;

const dayTotals = (db: { planned_meals: Row[] }) =>
  db.planned_meals.reduce<{ kcal: number; protein_g: number }>(
    (s, m) => ({
      kcal: s.kcal + Number(m.kcal),
      protein_g: s.protein_g + Number(m.protein_g),
    }),
    { kcal: 0, protein_g: 0 },
  );

describe("the reported days, built end to end", () => {
  it("#27 — rice, vegemince, olive oil twice with a banana + powder snack", async () => {
    // The exact report: "A fixed portion of 1 medium basmati rice (cooked) 200 g
    // for lunch and another one for dinner, leaving the user with no macros for
    // the banana snack." The rice row carries that 200 g "medium" preset.
    const rice = item("Basmati Rice (cooked)", 130, 2.7, 28, 0.3, {
      unit_g: 200,
      unit_label: "medium",
    });
    const mince = item("Linda McCartney Foods - Vegemince", 130, 16, 5, 3, {
      unit_g: 100,
      unit_label: "portion",
    });
    const oil = item("Olive Oil", 900, 0, 0, 100);
    const banana = item("Banana", 89, 1.1, 23, 0.3, {
      unit_g: 120,
      unit_label: "banana",
    });
    const powder = item("Phd Vegan Protein", 385, 75, 6, 6);

    const { db } = installFakeSupabase({
      db: {
        users: [profile(["Lunch", "Snack", "Dinner"])],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [rice, mince, oil, banana, powder],
        planned_meals: [
          meal("m1", "Lunch", [pickOf(rice), pickOf(mince), pickOf(oil)]),
          meal("m2", "Snack", [pickOf(banana), pickOf(powder)]),
          meal("m3", "Dinner", [pickOf(rice), pickOf(mince), pickOf(oil)]),
        ],
      },
    });

    await buildMyDay();
    const fake = db as { planned_meals: Row[] };

    // The rice is portioned BY WEIGHT, not locked to its 200 g "medium" preset:
    // the two meals get different amounts, sized to what the day needs.
    const riceLunch = gramsIn(fake, "Lunch", "Basmati Rice (cooked)");
    const riceDinner = gramsIn(fake, "Dinner", "Basmati Rice (cooked)");
    expect(riceLunch).toBeGreaterThan(0);
    expect(riceDinner).toBeGreaterThan(0);
    expect(riceLunch === 200 && riceDinner === 200).toBe(false);
    // The snack those fixed servings used to starve is a real meal.
    expect(gramsIn(fake, "Snack", "Banana")).toBeGreaterThan(0);
    expect(gramsIn(fake, "Snack", "Phd Vegan Protein")).toBeGreaterThan(0);
    // Every pick is on a plate.
    expect(portionsOf(fake, "Lunch")).toHaveLength(3);
    expect(portionsOf(fake, "Snack")).toHaveLength(2);
    expect(portionsOf(fake, "Dinner")).toHaveLength(3);
    // And the day lands.
    const tot = dayTotals(fake);
    expect(Math.abs(tot.kcal - 2000)).toBeLessThanOrEqual(50);
    expect(Math.abs(tot.protein_g - 150)).toBeLessThanOrEqual(15);
  });

  // What the chips come to when the spread is not picked (asserted by the control
  // test at the bottom), so the "less chips" claim is measured, not asserted at.
  const CHIPS_WITHOUT_SPREAD = 331;

  it("#28 — a fat spread picked for dinner on a day with little fat left", async () => {
    // The screenshot's dinner, inside a day: chicken, straight cut chips, three
    // veg and flora plant butter spreadable. The spread used to be dropped with
    // "Couldn't fit flora plant butter spreadable" while the chips stayed at
    // 184 g.
    const chicken = item("Chicken Breast Fillets", 106, 24, 0, 1.4);
    const chips = item("Straight cut chips", 151, 2.7, 21.7, 4.9);
    const peppers = item("Sweet peppers", 27, 0.9, 6.3, 0.3);
    const broccoli = item("Tenderstem Broccoli", 27, 3.5, 2.3, 0.4);
    const rocket = item("Wild Rocket", 24, 4.3, 0.3, 0.6);
    const spread = item("flora plant butter spreadable", 531, 0, 0, 59);
    const oats = item("Porridge Oats", 379, 11, 60, 8);
    const yogurt = item("Greek Yogurt", 59, 10, 3.6, 0.4);
    const rice = item("Basmati Rice (cooked)", 130, 2.7, 28, 0.3, {
      unit_g: 200,
      unit_label: "medium",
    });

    const { db } = installFakeSupabase({
      db: {
        users: [profile(["Breakfast", "Lunch", "Dinner"])],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [
          chicken,
          chips,
          peppers,
          broccoli,
          rocket,
          spread,
          oats,
          yogurt,
          rice,
        ],
        planned_meals: [
          meal("m1", "Breakfast", [pickOf(oats), pickOf(yogurt)]),
          meal("m2", "Lunch", [pickOf(chicken), pickOf(rice), pickOf(broccoli)]),
          meal("m3", "Dinner", [
            pickOf(chicken),
            pickOf(chips),
            pickOf(peppers),
            pickOf(broccoli),
            pickOf(rocket),
            pickOf(spread),
          ]),
        ],
      },
    });

    await buildMyDay();
    const fake = db as { planned_meals: Row[] };

    // The spread is served, at a spread-sized serving.
    expect(
      gramsIn(fake, "Dinner", "flora plant butter spreadable"),
    ).toBeGreaterThanOrEqual(10);
    // Nothing was dropped, and no meal claims it couldn't fit a pick.
    expect(portionsOf(fake, "Dinner")).toHaveLength(6);
    expect(fake.planned_meals.map((m) => String(m.why ?? "")).join(" ")).not.toMatch(
      /couldn't fit/i,
    );
    const tot = dayTotals(fake);
    expect(Math.abs(tot.kcal - 2000)).toBeLessThanOrEqual(50);
    expect(Math.abs(tot.protein_g - 150)).toBeLessThanOrEqual(15);
    // The chips paid for it: fewer than in the same dinner without the spread
    // (the control below) — exactly what the report asked for.
    expect(gramsIn(fake, "Dinner", "Straight cut chips")).toBeLessThan(
      CHIPS_WITHOUT_SPREAD,
    );
  });

  it("#28 — the same dinner WITHOUT the spread, to see what it cost", async () => {
    const chicken = item("Chicken Breast Fillets", 106, 24, 0, 1.4);
    const chips = item("Straight cut chips", 151, 2.7, 21.7, 4.9);
    const peppers = item("Sweet peppers", 27, 0.9, 6.3, 0.3);
    const broccoli = item("Tenderstem Broccoli", 27, 3.5, 2.3, 0.4);
    const rocket = item("Wild Rocket", 24, 4.3, 0.3, 0.6);
    const oats = item("Porridge Oats", 379, 11, 60, 8);
    const yogurt = item("Greek Yogurt", 59, 10, 3.6, 0.4);
    const rice = item("Basmati Rice (cooked)", 130, 2.7, 28, 0.3, {
      unit_g: 200,
      unit_label: "medium",
    });

    const { db } = installFakeSupabase({
      db: {
        users: [profile(["Breakfast", "Lunch", "Dinner"])],
        daily_targets: targets(),
        food_logs: [],
        pantry_items: [chicken, chips, peppers, broccoli, rocket, oats, yogurt, rice],
        planned_meals: [
          meal("m1", "Breakfast", [pickOf(oats), pickOf(yogurt)]),
          meal("m2", "Lunch", [pickOf(chicken), pickOf(rice), pickOf(broccoli)]),
          meal("m3", "Dinner", [
            pickOf(chicken),
            pickOf(chips),
            pickOf(peppers),
            pickOf(broccoli),
            pickOf(rocket),
          ]),
        ],
      },
    });

    await buildMyDay();
    // The control the test above compares against: without the spread, the chips
    // take the room it would have used.
    expect(
      gramsIn(db as { planned_meals: Row[] }, "Dinner", "Straight cut chips"),
    ).toBe(CHIPS_WITHOUT_SPREAD);
  });
});
