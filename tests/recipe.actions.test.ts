import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";

// vi.mock is hoisted above the imports, so the factory reaches the fake lazily.
vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const parseRecipeFromUrl = vi.fn();
vi.mock("@/lib/ai", () => ({
  parseRecipeFromUrl: (url: string) => parseRecipeFromUrl(url),
  parseRecipeFromImage: vi.fn(),
}));

// Open Food Facts is the last resort for an ingredient; kept offline here.
const searchProducts = vi.fn(async (): Promise<Row[]> => []);
vi.mock("@/lib/off", () => ({
  searchProducts: () => searchProducts(),
}));

const { addRecipeToMeal, importRecipeUrl } = await import(
  "@/app/(app)/plan/recipe/actions"
);
const { localToday } = await import("@/lib/queries");

const omelette = {
  name: "Basic omelette",
  servings: 1,
  ingredients: [{ name: "3 eggs", quantity: "" }],
  kcal: 277,
  protein_g: 20,
  carbs_g: 0,
  fat_g: 22,
};

describe("importRecipeUrl", () => {
  it("hands the recipe back when the page reads", async () => {
    installFakeSupabase({ db: {} });
    parseRecipeFromUrl.mockResolvedValueOnce(omelette);

    const r = await importRecipeUrl("https://example.com/omelette");

    expect(r).toEqual({ ok: true, recipe: omelette });
  });

  // A production build masks a thrown server action's message, which is how a
  // refused Waitrose fetch reached the screen as "An error occurred in the
  // Server Components render". The reason has to come back as a value.
  it("returns the reason instead of throwing when the import fails", async () => {
    installFakeSupabase({ db: {} });
    vi.spyOn(console, "error").mockImplementation(() => {});
    parseRecipeFromUrl.mockRejectedValueOnce(
      new Error("Couldn't fetch that page. Check the link."),
    );

    const r = await importRecipeUrl("https://example.com/omelette");

    expect(r).toEqual({ ok: false, message: "Couldn't fetch that page. Check the link." });
  });
});

// Reference foods, macros per 100 g as PostgREST returns them.
const ref = (id: string, name: string, kcal: number, p: number, c: number, f: number): Row => ({
  id,
  name,
  kcal_100g: String(kcal),
  protein_100g: String(p),
  carbs_100g: String(c),
  fat_100g: String(f),
  fiber_100g: "0",
  sugar_100g: "0",
  satfat_100g: "0",
  sodium_mg_100g: "0",
  cooked: false,
});

function kitchen(planned: Row[] = []) {
  return installFakeSupabase({
    db: {
      users: [
        { id: "user-1", meal_slots: ["Breakfast", "Lunch", "Snack", "Dinner"], timezone: "Europe/London" },
      ],
      pantry_items: [],
      food_aliases: [],
      fresh_foods: [
        ref("f-egg", "Egg", 143, 12.6, 0.7, 9.5),
        ref("f-oil", "Sunflower oil", 884, 0, 0, 100),
        ref("f-butter", "Butter", 717, 0.9, 0.1, 81),
        ref("f-noodle", "Rice noodles", 108, 1.8, 24, 0.2),
      ],
      fresh_food_sizes: [
        { id: "s1", food_id: "f-egg", label: "small", grams: "38" },
        { id: "s2", food_id: "f-egg", label: "medium", grams: "44" },
        { id: "s3", food_id: "f-egg", label: "large", grams: "50" },
      ],
      planned_meals: planned,
    },
  });
}

const line = (name: string) => ({ name, quantity: "" });

describe("addRecipeToMeal", () => {
  it("puts the omelette into the chosen meal as foods, eggs counted", async () => {
    const { db } = kitchen();
    const recipe = {
      ...omelette,
      ingredients: [line("3 eggs beaten"), line("1 tsp sunflower oil"), line("1 tsp butter")],
    };

    const r = await addRecipeToMeal(recipe, 1, "Breakfast");

    expect(r).toEqual({ ok: true, slot: "Breakfast", added: 3, unmatched: [] });
    const meal = db.planned_meals.find((m) => m.slot === "Breakfast")!;
    expect(meal.origin).toBe("manual");
    const items = meal.items as Row[];
    expect(items.map((i) => [i.name, i.grams])).toEqual([
      ["Egg", 132],
      ["Sunflower oil", 5],
      ["Butter", 5],
    ]);
    // Carries the egg's size, so the meal builder steps it in whole eggs and
    // the user can make it with two.
    expect(items[0].unit_g).toBe(44);
    // 132 g egg + 5 g oil + 5 g butter: 188.8 + 44.2 + 35.9
    expect(Math.round(meal.kcal as number)).toBe(269);
  });

  it("scales the amounts from the recipe's yield to the servings eaten", async () => {
    const { db } = kitchen();
    const recipe = { ...omelette, servings: 2, ingredients: [line("275 g pack rice noodles")] };

    await addRecipeToMeal(recipe, 1, "Lunch");

    const items = db.planned_meals.find((m) => m.slot === "Lunch")!.items as Row[];
    expect(items[0].grams).toBe(138);
  });

  it("adds to a meal the user already built, keeping what was there", async () => {
    const toast = { name: "Toast", source: "off", off_barcode: null, grams: 40, kcal_100g: 260, protein_100g: 9, carbs_100g: 48, fat_100g: 3 };
    const { db } = kitchen([
      { id: "m1", user_id: "user-1", date: await localToday(), slot: "Breakfast", origin: "manual", items: [toast], logged_food_id: null },
    ]);

    await addRecipeToMeal({ ...omelette, ingredients: [line("1 tsp butter")] }, 1, "Breakfast");

    const meals = db.planned_meals.filter((m) => m.slot === "Breakfast");
    expect(meals).toHaveLength(1);
    expect((meals[0].items as Row[]).map((i) => i.name)).toEqual(["Toast", "Butter"]);
  });

  it("won't write over a meal already eaten or one the app planned", async () => {
    kitchen([
      { id: "m1", user_id: "user-1", date: await localToday(), slot: "Lunch", origin: "manual", items: [], logged_food_id: "log-1" },
      { id: "m2", user_id: "user-1", date: await localToday(), slot: "Dinner", origin: "ai", items: [], logged_food_id: null },
    ]);

    const eaten = await addRecipeToMeal(omelette, 1, "Lunch");
    const planned = await addRecipeToMeal(omelette, 1, "Dinner");

    expect(eaten).toMatchObject({ ok: false, message: expect.stringContaining("already eaten") });
    expect(planned).toMatchObject({ ok: false, message: expect.stringContaining("Clear it") });
  });

  it("lists the lines it couldn't match and skips the seasoning", async () => {
    kitchen();
    const recipe = {
      ...omelette,
      ingredients: [line("3 eggs"), line("1 sprig of lovage"), line("salt and pepper")],
    };

    const r = await addRecipeToMeal(recipe, 1, "Breakfast");

    expect(r).toEqual({ ok: true, slot: "Breakfast", added: 1, unmatched: ["1 sprig of lovage"] });
  });
});
