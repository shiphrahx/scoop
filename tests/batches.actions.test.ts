import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";

// vi.mock is hoisted above the imports, so the factory reaches the fake lazily.
vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { createBatch, eatFromBatch } = await import("@/app/(app)/batches/actions");

// A pot of chilli: 2 kg cooked, 3000 kcal, 200 g protein in the whole thing.
const batch = (over: Row = {}): Row => ({
  id: "batch-1",
  user_id: "user-1",
  name: "Chilli",
  total_cooked_g: 2000,
  remaining_g: 2000,
  kcal: 3000,
  protein_g: 200,
  carbs_g: 300,
  fat_g: 100,
  ...over,
});

describe("createBatch", () => {

  it("sums the packs into the pot's totals and starts it full", async () => {
    const { db } = installFakeSupabase({ db: { batches: [] } });

    await createBatch({
      name: "Chilli",
      total_cooked_g: 2000,
      source_packs: [
        { name: "Mince", grams: 500, kcal: 1000, protein_g: 100, carbs_g: 0, fat_g: 60 },
        { name: "Beans", grams: 400, kcal: 400, protein_g: 24, carbs_g: 70, fat_g: 2 },
      ],
    });

    expect(db.batches).toHaveLength(1);
    const row = db.batches[0];
    expect(row.kcal).toBe(1400);
    expect(row.protein_g).toBe(124);
    expect(row.carbs_g).toBe(70);
    expect(row.fat_g).toBe(62);
    // The pot starts with everything still in it.
    expect(row.remaining_g).toBe(2000);
    expect(row.total_cooked_g).toBe(2000);
  });
});

describe("eatFromBatch", () => {

  it("logs the macros for the share eaten and takes it off the pot", async () => {
    const { db } = installFakeSupabase({ db: { batches: [batch()], food_logs: [] } });

    await eatFromBatch("batch-1", 500); // a quarter of a 2 kg pot

    expect(db.food_logs).toHaveLength(1);
    const log = db.food_logs[0];
    expect(log.kcal).toBe(750); // 3000 / 4
    expect(log.protein_g).toBe(50); // 200 / 4
    expect(log.carbs_g).toBe(75);
    expect(log.fat_g).toBe(25);
    expect(log.grams).toBe(500);
    expect(log.source).toBe("batch");

    expect(db.batches[0].remaining_g).toBe(1500);
  });

  it("refuses a serving bigger than what is left in the pot", async () => {
    // 300 g left but the user asks for 500 g. Serving it would log macros for
    // food that isn't there and leave the pot at 0 — the numbers stop matching
    // the food.
    const { db } = installFakeSupabase({
      db: { batches: [batch({ remaining_g: 300 })], food_logs: [] },
    });

    await expect(eatFromBatch("batch-1", 500)).rejects.toThrow(/only 300 g left/i);
    expect(db.food_logs).toHaveLength(0);
    expect(db.batches[0].remaining_g).toBe(300); // untouched
  });

  it("refuses a negative serving", async () => {
    // Math.max(0, remaining - grams) with a negative grams ADDS to the pot, and
    // logs negative macros — free calories back on the day's budget.
    const { db } = installFakeSupabase({ db: { batches: [batch()], food_logs: [] } });

    await expect(eatFromBatch("batch-1", -500)).rejects.toThrow(/more than 0/i);
    expect(db.food_logs).toHaveLength(0);
    expect(db.batches[0].remaining_g).toBe(2000);
  });

  it("refuses a serving that isn't a number", async () => {
    const { db } = installFakeSupabase({ db: { batches: [batch()], food_logs: [] } });

    await expect(eatFromBatch("batch-1", Number.NaN)).rejects.toThrow(/more than 0/i);
    await expect(eatFromBatch("batch-1", Number.POSITIVE_INFINITY)).rejects.toThrow();
    expect(db.food_logs).toHaveLength(0);
  });

  it("will not serve from someone else's batch", async () => {
    // The action looks the batch up by id. Without a user_id filter it leans
    // entirely on RLS; if a policy ever regresses this is an IDOR.
    const { db } = installFakeSupabase({
      user: { id: "user-1" },
      db: { batches: [batch({ user_id: "someone-else" })], food_logs: [] },
    });

    await expect(eatFromBatch("batch-1", 100)).rejects.toThrow();
    expect(db.food_logs).toHaveLength(0);
    expect(db.batches[0].remaining_g).toBe(2000);
  });

  it("refuses a pot with no recorded weight rather than dividing by zero", async () => {
    const { db } = installFakeSupabase({
      db: { batches: [batch({ total_cooked_g: 0 })], food_logs: [] },
    });

    await expect(eatFromBatch("batch-1", 100)).rejects.toThrow(/no weight/i);
    expect(db.food_logs).toHaveLength(0);
  });

  it("is rejected when nobody is signed in", async () => {
    installFakeSupabase({ user: null, db: { batches: [batch()], food_logs: [] } });
    await expect(eatFromBatch("batch-1", 100)).rejects.toThrow(/not signed in/i);
  });
});
