import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const {
  addPantryItem,
  updatePantryItem,
  setPantryUnit,
  addFreshFoodSize,
} = await import("@/app/(app)/pantry/actions");

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
