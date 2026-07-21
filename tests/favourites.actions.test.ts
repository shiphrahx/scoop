import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";
import type { PlanItem } from "@/lib/types";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const {
  saveFavouriteMeal,
  saveMealAsFavourite,
  addFavouriteMeal,
  deleteFavouriteMeal,
} = await import("@/app/(app)/plan/day/actions");

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const profile = (): Row => ({
  id: "user-1",
  meal_slots: ["Breakfast", "Lunch", "Dinner"],
});

const item = (name: string, grams: number, kcal: number, p: number, c: number, f: number): PlanItem => ({
  name,
  source: "pantry",
  off_barcode: null,
  grams,
  kcal_100g: kcal,
  protein_100g: p,
  carbs_100g: c,
  fat_100g: f,
  fiber_100g: 0,
  sugar_100g: 0,
  satfat_100g: 0,
  sodium_mg_100g: 0,
});

describe("saveFavouriteMeal", () => {
  it("saves the foods and their exact totals under a name", async () => {
    const { db } = installFakeSupabase({
      db: { users: [profile()], favourite_meals: [] },
    });

    await saveFavouriteMeal("Chicken & rice", [
      item("Chicken", 200, 165, 31, 0, 3.6),
      item("Rice", 150, 130, 2.7, 28, 0.3),
    ]);

    expect(db.favourite_meals).toHaveLength(1);
    const row = db.favourite_meals[0];
    expect(row.name).toBe("Chicken & rice");
    expect((row.items as PlanItem[]).map((i) => i.name)).toEqual(["Chicken", "Rice"]);
    // 200 g chicken (330) + 150 g rice (195) = 525 kcal; protein 62 + 4 = 66.
    expect(row.kcal).toBe(525);
    expect(row.protein_g).toBe(66);
  });

  it("refuses a meal with no foods", async () => {
    installFakeSupabase({ db: { users: [profile()], favourite_meals: [] } });
    await expect(saveFavouriteMeal("Empty", [])).rejects.toThrow(/no foods/i);
  });

  it("falls back to a default name when given a blank one", async () => {
    const { db } = installFakeSupabase({
      db: { users: [profile()], favourite_meals: [] },
    });
    await saveFavouriteMeal("   ", [item("Rice", 150, 130, 2.7, 28, 0.3)]);
    expect(db.favourite_meals[0].name).toBe("Saved meal");
  });

  it("rejects a food with impossible macros", async () => {
    installFakeSupabase({ db: { users: [profile()], favourite_meals: [] } });
    const bad = { ...item("Rice", 150, 130, 900, 28, 0.3) };
    await expect(saveFavouriteMeal("Bad", [bad])).rejects.toThrow(/Rice/);
  });
});

describe("saveMealAsFavourite", () => {
  it("saves an app-portioned dish by converting its portions", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        favourite_meals: [],
        planned_meals: [
          {
            id: "meal-1",
            user_id: "user-1",
            date: today(),
            slot: "Dinner",
            origin: "ai",
            name: "Chicken with Rice",
            items: [],
            picks: [],
            portions: [
              { name: "Chicken", grams: 200, kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7 },
              { name: "Rice", grams: 150, kcal: 195, protein_g: 4, carbs_g: 42, fat_g: 0 },
            ],
            logged_food_id: null,
          },
        ],
      },
    });

    await saveMealAsFavourite("meal-1", "");

    expect(db.favourite_meals).toHaveLength(1);
    const row = db.favourite_meals[0];
    expect(row.name).toBe("Chicken with Rice"); // fell back to the meal name
    expect((row.items as PlanItem[]).map((i) => i.name)).toEqual(["Chicken", "Rice"]);
    expect(row.kcal).toBe(525);
  });
});

describe("addFavouriteMeal", () => {
  it("drops a saved favourite into a slot as a hand-built meal", async () => {
    const items = [item("Chicken", 200, 165, 31, 0, 3.6), item("Rice", 150, 130, 2.7, 28, 0.3)];
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        planned_meals: [],
        favourite_meals: [
          {
            id: "fav-1",
            user_id: "user-1",
            name: "Chicken & rice",
            items,
            kcal: 525,
            protein_g: 66,
            carbs_g: 42,
            fat_g: 7,
          },
        ],
      },
    });

    await addFavouriteMeal("fav-1", "Lunch");

    expect(db.planned_meals).toHaveLength(1);
    const row = db.planned_meals[0];
    expect(row.slot).toBe("Lunch");
    expect(row.origin).toBe("manual");
    expect(row.name).toBe("Chicken & rice");
    expect((row.items as PlanItem[]).map((i) => i.name)).toEqual(["Chicken", "Rice"]);
    expect(row.kcal).toBe(525);
    expect(row.picks).toEqual([]);
  });

  it("throws when the favourite is gone", async () => {
    installFakeSupabase({
      db: { users: [profile()], planned_meals: [], favourite_meals: [] },
    });
    await expect(addFavouriteMeal("nope", "Lunch")).rejects.toThrow(/not found/i);
  });
});

describe("deleteFavouriteMeal", () => {
  it("removes the favourite", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [profile()],
        favourite_meals: [
          { id: "fav-1", user_id: "user-1", name: "X", items: [], kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0 },
        ],
      },
    });
    await deleteFavouriteMeal("fav-1");
    expect(db.favourite_meals).toHaveLength(0);
  });
});
