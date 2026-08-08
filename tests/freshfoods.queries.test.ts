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

  // The reference names foods in the singular, but nobody types "one cookie" —
  // they type "cookies". Without the retry the natural query draws a blank.
  it("finds a singular food from a plural query", async () => {
    installFakeSupabase({
      db: {
        fresh_foods: [food("f-1", "Chocolate Chip Cookie")],
        fresh_food_sizes: [size("f-1", "medium", 16)],
      },
    });

    const [cookie] = await searchFreshFoods("cookies");
    expect(cookie?.name).toBe("Chocolate Chip Cookie");
    expect(cookie.sizes[0].grams).toBe(16);
  });

  it("singularises -ies and -oes endings too", async () => {
    installFakeSupabase({
      db: {
        fresh_foods: [food("f-1", "Brownie"), food("f-2", "Potato")],
        fresh_food_sizes: [],
      },
    });

    expect((await searchFreshFoods("brownies"))[0]?.name).toBe("Brownie");
    expect((await searchFreshFoods("potatoes"))[0]?.name).toBe("Potato");
  });

  // A word that merely ends in "s" must not be mangled into a wrong match.
  it("leaves a genuine singular alone", async () => {
    installFakeSupabase({
      db: { fresh_foods: [food("f-1", "Hummus")], fresh_food_sizes: [] },
    });
    expect((await searchFreshFoods("hummus"))[0]?.name).toBe("Hummus");
  });

  it("comes back empty when nothing matches", async () => {
    installFakeSupabase({
      db: { fresh_foods: [food("f-1", "Banana")], fresh_food_sizes: [] },
    });
    expect(await searchFreshFoods("xyzzy")).toEqual([]);
  });
});

// The reference is now thousands of USDA rows, which changes two things: names
// are comma-inverted and heavily qualified, and they are American.
describe("searchFreshFoods — a big, American reference", () => {
  const usda = () =>
    installFakeSupabase({
      db: {
        fresh_foods: [
          food("f-1", "Cake or cupcake, chocolate with chocolate icing, bakery"),
          food("f-2", "Cake or cupcake, chocolate, dry mix"),
          food("f-3", "Potato chips"),
          food("f-4", "French fries, from fresh"),
          food("f-5", "Cookie, chocolate chip"),
          food("f-6", "Digestive Biscuit"),
          food("f-7", "Croissant"),
        ],
        fresh_food_sizes: [],
        food_aliases: [
          { alias: "chips", term: "french fries" },
          { alias: "biscuit", term: "cookie" },
          { alias: "crisps", term: "potato chips" },
        ],
      },
    });

  // A substring search for "chocolate cake" finds nothing in this data — the
  // words are the wrong way round and split apart. Matching word by word is the
  // only thing that reaches it.
  it("matches every word anywhere in the name, not one substring", async () => {
    usda();
    const names = (await searchFreshFoods("chocolate cake")).map((f) => f.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names[0]).toContain("chocolate");
    expect(names[0]).toContain("Cake");
  });

  // "chips" here means french fries. Searched literally it finds Potato chips —
  // a real hit for the wrong food — so the swap can't wait for a failed search.
  it("reads a British word as the food a Brit means, even when the literal word hits", async () => {
    usda();
    const names = (await searchFreshFoods("chips")).map((f) => f.name);
    expect(names[0]).toBe("French fries, from fresh");
    // Crisps are still reachable, just not first.
    expect(names).toContain("Potato chips");
  });

  it("swaps the other way too: crisps are potato chips", async () => {
    usda();
    expect((await searchFreshFoods("crisps"))[0].name).toBe("Potato chips");
  });

  // A British food seeded by hand has no alias pointing at it; it must still be
  // findable by its own name.
  it("keeps a hand-seeded British food reachable", async () => {
    usda();
    expect((await searchFreshFoods("digestive")).map((f) => f.name)).toContain(
      "Digestive Biscuit",
    );
  });

  // Every row returned contains every word searched for, so the winner is the
  // one carrying the fewest words nobody asked for.
  it("puts the tightest match first, not the alphabetically first", async () => {
    usda();
    expect((await searchFreshFoods("croissant"))[0].name).toBe("Croissant");
  });

  it("still finds nothing for a word that isn't there", async () => {
    usda();
    expect(await searchFreshFoods("xyzzy")).toEqual([]);
  });
});

const { applyAliases, rankFreshFood } = await import("@/lib/queries");

const UK = [
  { alias: "crisps", term: "potato chips" },
  { alias: "chips", term: "french fries" },
  { alias: "spring onion", term: "scallion" },
  { alias: "biscuit", term: "cookie" },
];

describe("applyAliases", () => {
  it("swaps a British word for the American one", () => {
    expect(applyAliases("chips", UK)).toBe("french fries");
  });

  // The one that bit: "crisps" expands to "potato chips", and a second pass over
  // that output turned the "chips" rule loose on it — "potato french fries".
  it("never re-reads what it just wrote", () => {
    expect(applyAliases("crisps", UK)).toBe("potato chips");
  });

  it("swaps a multi-word alias whole, not word by word", () => {
    expect(applyAliases("spring onion", UK)).toBe("scallion");
  });

  it("leaves the untouched words in place and in order", () => {
    expect(applyAliases("chocolate biscuit", UK)).toBe("chocolate cookie");
  });

  it("returns null when no alias applies, so no second search runs", () => {
    expect(applyAliases("banana", UK)).toBeNull();
    expect(applyAliases("", UK)).toBeNull();
  });

  it("matches whole words only — 'chipshop' is not 'chips'", () => {
    expect(applyAliases("chipshop", UK)).toBeNull();
  });
});

describe("rankFreshFood", () => {
  const best = (query: string, names: string[]) =>
    [...names].sort((a, b) => rankFreshFood(query, a) - rankFreshFood(query, b))[0];

  it("prefers the exact name", () => {
    expect(best("croissant", ["Croissant, apple", "Croissant", "Croissant, cheese"]))
      .toBe("Croissant");
  });

  it("prefers the name carrying fewest words nobody asked for", () => {
    expect(
      best("chocolate cake", [
        "Cake or cupcake, chocolate with chocolate icing, bakery, ready to eat",
        "Cake, chocolate",
      ]),
    ).toBe("Cake, chocolate");
  });

  it("prefers a name that opens with what was typed", () => {
    expect(best("cake", ["Sponge, cake type", "Cake, plain"])).toBe("Cake, plain");
  });
});
