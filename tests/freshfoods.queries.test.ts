import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});

const { searchFreshFoods } = await import("@/lib/queries");

// A reference food row, macros as PostgREST hands them back — strings, not
// numbers — so the test also proves the query coerces them.
const food = (id: string, name: string, over: Row = {}): Row => ({
  id,
  name,
  kcal_100g: "89",
  protein_100g: "1.1",
  carbs_100g: "22.8",
  fat_100g: "0.3",
  fiber_100g: "2.6",
  sugar_100g: "12.2",
  satfat_100g: "0.1",
  sodium_mg_100g: "1",
  ...over,
});

const size = (food_id: string, label: string, grams: number): Row => ({
  id: `${food_id}-${label}`,
  food_id,
  label,
  grams: String(grams),
});

describe("searchFreshFoods", () => {
  it("returns matching foods with their sizes, smallest first", async () => {
    installFakeSupabase({
      db: {
        fresh_foods: [food("f-banana", "Banana")],
        fresh_food_sizes: [
          size("f-banana", "large", 136),
          size("f-banana", "small", 101),
          size("f-banana", "medium", 118),
        ],
      },
    });

    const [banana] = await searchFreshFoods("banana");
    expect(banana.name).toBe("Banana");
    // Numbers, not the strings the DB returned.
    expect(banana.kcal_100g).toBe(89);
    expect(banana.protein_100g).toBeCloseTo(1.1);
    expect(banana.sizes.map((s) => s.label)).toEqual(["small", "medium", "large"]);
    expect(banana.sizes.map((s) => s.grams)).toEqual([101, 118, 136]);
  });

  it("only attaches a food's own sizes", async () => {
    installFakeSupabase({
      db: {
        fresh_foods: [food("f-apple", "Apple")],
        fresh_food_sizes: [
          size("f-apple", "medium", 182),
          size("f-banana", "medium", 118), // a different food's size
        ],
      },
    });

    const [apple] = await searchFreshFoods("apple");
    expect(apple.sizes).toHaveLength(1);
    expect(apple.sizes[0].grams).toBe(182);
  });

  it("ranks an exact name, then a prefix, then a mere substring", async () => {
    installFakeSupabase({
      db: {
        fresh_foods: [
          food("f-1", "Pineapple"), // substring of 'apple'? no — contains 'apple'
          food("f-2", "Apple Juice"), // prefix
          food("f-3", "Apple"), // exact
        ],
        fresh_food_sizes: [],
      },
    });

    const names = (await searchFreshFoods("apple")).map((f) => f.name);
    expect(names[0]).toBe("Apple");
    expect(names[1]).toBe("Apple Juice");
    expect(names[2]).toBe("Pineapple");
  });

  it("ignores a query shorter than two characters", async () => {
    installFakeSupabase({
      db: { fresh_foods: [food("f-1", "Egg")], fresh_food_sizes: [] },
    });
    expect(await searchFreshFoods("e")).toEqual([]);
    expect(await searchFreshFoods(" ")).toEqual([]);
  });

  it("comes back empty when nothing matches", async () => {
    installFakeSupabase({
      db: { fresh_foods: [food("f-1", "Banana")], fresh_food_sizes: [] },
    });
    expect(await searchFreshFoods("xyzzy")).toEqual([]);
  });
});
