import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const {
  addPantryItem,
  addMatchedItems,
  updatePantryItem,
  setPantryUnit,
  addFreshFoodSize,
} = await import("@/app/(app)/pantry/actions");

// The shared cooked-rice reference (mirrors migration 0021), so an added dry
// staple can be steered onto its cooked macros.
const cookedRiceDb = () => ({
  fresh_foods: [
    {
      id: "fr-white-rice",
      name: "White Rice (cooked)",
      kcal_100g: "130",
      protein_100g: "2.7",
      carbs_100g: "28.2",
      fat_100g: "0.3",
      fiber_100g: "0.4",
      sugar_100g: "0.1",
      satfat_100g: "0.1",
      sodium_mg_100g: "1",
      cooked: true,
    },
  ],
  fresh_food_sizes: [
    { id: "fr-white-rice-small", food_id: "fr-white-rice", label: "small", grams: "150" },
    { id: "fr-white-rice-medium", food_id: "fr-white-rice", label: "medium", grams: "200" },
    { id: "fr-white-rice-large", food_id: "fr-white-rice", label: "large", grams: "250" },
  ],
  pantry_items: [] as Row[],
});

const bananaInput = (over: Row = {}) => ({
  name: "Banana",
  off_barcode: null,
  quantity: 1,
  kcal_100g: 89,
  protein_100g: 1.1,
  carbs_100g: 22.8,
  fat_100g: 0.3,
  unit_g: 118,
  unit_label: "medium banana",
  unit_options: [
    { label: "small", grams: 101 },
    { label: "medium", grams: 118 },
    { label: "large", grams: 136 },
  ],
  ...over,
});

describe("addPantryItem with fresh-food sizes", () => {
  it("stores all sizes plus the selected unit", async () => {
    const { db } = installFakeSupabase({ db: { pantry_items: [] } });

    await addPantryItem(bananaInput());

    const row = db.pantry_items[0];
    expect(row.unit_g).toBe(118);
    expect(row.unit_label).toBe("medium banana");
    expect(row.unit_options).toEqual([
      { label: "small", grams: 101 },
      { label: "medium", grams: 118 },
      { label: "large", grams: 136 },
    ]);
    // A fresh fruit lands on the Fruits shelf, not "Carbs".
    expect(row.category).toBe("Fruits");
  });

  it("rejects a food whose macros can't be real, before it reaches the pantry", async () => {
    // A bad barcode record once carried protein > 100 g/100g; it saved fine but
    // the day planner then refused to portion it, stranding the food. Catch it
    // at the write, with a message the user can act on.
    const { db } = installFakeSupabase({ db: { pantry_items: [] } });

    await expect(
      addPantryItem(bananaInput({ name: "Vegemince", protein_100g: 170 })),
    ).rejects.toThrow(/Vegemince.*protein_100g/);
    expect(db.pantry_items).toHaveLength(0);
  });

  it("stores a dry staple with COOKED macros, whatever the pack said", async () => {
    // Raw basmati is ~78 g carbs/100g; on the plate it's the cooked ~28. A pack
    // scanned/imported/typed with raw numbers must land cooked so a meal never
    // shows raw carbs. The item is also renamed to make cooked unmistakable.
    const { db } = installFakeSupabase({ db: cookedRiceDb() });

    await addPantryItem(
      bananaInput({
        name: "Basmati Rice",
        kcal_100g: 356,
        protein_100g: 7.5,
        carbs_100g: 78,
        fat_100g: 0.6,
        unit_g: null,
        unit_label: null,
        unit_options: null,
      }),
    );

    const row = db.pantry_items[0];
    expect(row.name).toBe("White Rice (cooked)");
    expect(row.carbs_100g).toBe(28.2);
    expect(row.kcal_100g).toBe(130);
    // 39 g now reads ~11 g carbs, not 30.
    expect((39 / 100) * row.carbs_100g).toBeCloseTo(11, 0);
    // Cooked serving sizes come along, defaulting to medium.
    expect(row.unit_g).toBe(200);
  });

  it("leaves a non-staple food's macros alone", async () => {
    const { db } = installFakeSupabase({ db: cookedRiceDb() });

    await addPantryItem(bananaInput({ name: "Chicken Breast", carbs_100g: 0, protein_100g: 31, kcal_100g: 165, fat_100g: 3.6 }));

    const row = db.pantry_items.find((r: Row) => r.name === "Chicken Breast")!;
    expect(row.name).toBe("Chicken Breast");
    expect(row.protein_100g).toBe(31);
  });

  it("does not swap a rice-adjacent product that isn't the plain staple", async () => {
    // "Rice pudding" / "rice milk" are different foods — the swap must not fire.
    const { db } = installFakeSupabase({ db: cookedRiceDb() });

    await addPantryItem(bananaInput({ name: "Rice Pudding", carbs_100g: 16, protein_100g: 3, kcal_100g: 97, fat_100g: 2 }));

    const row = db.pantry_items.find((r: Row) => r.name === "Rice Pudding")!;
    expect(row.name).toBe("Rice Pudding");
    expect(row.carbs_100g).toBe(16);
  });

  it("cooks dry staples on a grocery import too", async () => {
    const { db } = installFakeSupabase({ db: cookedRiceDb() });

    await addMatchedItems([
      { name: "Spaghetti", off_barcode: null, quantity: 1, kcal_100g: 358, protein_100g: 12, carbs_100g: 73, fat_100g: 1.5 },
      { name: "Basmati Rice", off_barcode: null, quantity: 2, kcal_100g: 356, protein_100g: 7.5, carbs_100g: 78, fat_100g: 0.6 },
    ]);

    // Rice matched the seeded cooked reference; spaghetti had no reference here,
    // so it's left as-is (still added).
    const rice = db.pantry_items.find((r: Row) => r.name === "White Rice (cooked)")!;
    expect(rice.carbs_100g).toBe(28.2);
    expect(db.pantry_items.some((r: Row) => r.name === "Spaghetti")).toBe(true);
  });

  it("drops empty or non-positive sizes and keeps null when none survive", async () => {
    const { db } = installFakeSupabase({ db: { pantry_items: [] } });

    await addPantryItem(
      bananaInput({
        unit_options: [
          { label: " ", grams: 101 },
          { label: "medium", grams: 0 },
        ],
      }),
    );

    expect(db.pantry_items[0].unit_options).toBeNull();
  });
});

describe("setPantryUnit", () => {
  const banana = (over: Row = {}): Row => ({
    id: "p-1",
    user_id: "user-1",
    name: "Banana",
    unit_g: 118,
    unit_label: "medium banana",
    unit_options: [
      { label: "small", grams: 101 },
      { label: "medium", grams: 118 },
      { label: "large", grams: 136 },
    ],
    ...over,
  });

  it("switches the selected size to another the item carries", async () => {
    const { db } = installFakeSupabase({ db: { pantry_items: [banana()] } });

    await setPantryUnit("p-1", "large");

    expect(db.pantry_items[0].unit_g).toBe(136);
    expect(db.pantry_items[0].unit_label).toBe("large");
  });

  it("ignores a size the item doesn't have", async () => {
    const { db } = installFakeSupabase({ db: { pantry_items: [banana()] } });

    await setPantryUnit("p-1", "jumbo");

    expect(db.pantry_items[0].unit_g).toBe(118);
    expect(db.pantry_items[0].unit_label).toBe("medium banana");
  });
});

describe("updatePantryItem", () => {
  it("keeps the sizes when a fresh food's macros are edited", async () => {
    // The edit form doesn't touch sizes; re-saving must not wipe them.
    const { db } = installFakeSupabase({
      db: {
        pantry_items: [
          {
            id: "p-1",
            user_id: "user-1",
            name: "Banana",
            kcal_100g: 89,
            unit_g: 118,
            unit_label: "medium banana",
            unit_options: [
              { label: "small", grams: 101 },
              { label: "medium", grams: 118 },
            ],
          },
        ],
      },
    });

    await updatePantryItem("p-1", {
      name: "Banana",
      kcal_100g: 90,
      protein_100g: 1.2,
      carbs_100g: 23,
      fat_100g: 0.3,
      pack_size_g: null,
      unit_g: 118,
      unit_label: "medium banana",
      unit_options: [
        { label: "small", grams: 101 },
        { label: "medium", grams: 118 },
      ],
      category: "Fruits",
    });

    const row = db.pantry_items[0];
    expect(row.kcal_100g).toBe(90);
    expect(row.unit_options).toHaveLength(2);
    expect(row.unit_g).toBe(118);
  });
});

describe("addFreshFoodSize", () => {
  it("adds a size owned by the contributing user", async () => {
    const { db } = installFakeSupabase({
      user: { id: "user-1" },
      db: { fresh_food_sizes: [] },
    });

    await addFreshFoodSize("f-banana", "extra large", 160);

    expect(db.fresh_food_sizes).toHaveLength(1);
    expect(db.fresh_food_sizes[0]).toMatchObject({
      food_id: "f-banana",
      label: "extra large",
      grams: 160,
      created_by: "user-1",
    });
  });

  it("does nothing for an empty label or non-positive grams", async () => {
    const { db } = installFakeSupabase({ db: { fresh_food_sizes: [] } });

    await addFreshFoodSize("f-banana", "  ", 160);
    await addFreshFoodSize("f-banana", "huge", 0);

    expect(db.fresh_food_sizes).toHaveLength(0);
  });
});
