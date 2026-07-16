import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { saveSlotWeights } = await import("@/app/(app)/me/actions");

const userRow = () => ({ id: "user-1", slot_weights: {} });

describe("saveSlotWeights", () => {
  it("saves the weights on the signed-in user", async () => {
    const { db } = installFakeSupabase({ db: { users: [userRow()] } });

    await saveSlotWeights({ Breakfast: 20, Lunch: 30, Snack: 10, Dinner: 40 });

    expect(db.users[0].slot_weights).toEqual({
      Breakfast: 20,
      Lunch: 30,
      Snack: 10,
      Dinner: 40,
    });
  });

  it("rounds fractional weights", async () => {
    const { db } = installFakeSupabase({ db: { users: [userRow()] } });
    await saveSlotWeights({ Lunch: 33.4, Dinner: 66.6 });
    expect(db.users[0].slot_weights).toEqual({ Lunch: 33, Dinner: 67 });
  });

  it("refuses a zero, negative or non-finite weight", async () => {
    // A zero weight would starve that meal of the whole day's food; NaN would
    // poison every share computed from the sum.
    installFakeSupabase({ db: { users: [userRow()] } });
    await expect(saveSlotWeights({ Lunch: 0 })).rejects.toThrow(/Lunch/);
    await expect(saveSlotWeights({ Dinner: -10 })).rejects.toThrow(/Dinner/);
    await expect(saveSlotWeights({ Snack: NaN })).rejects.toThrow(/Snack/);
  });

  it("drops blank slot names instead of saving them", async () => {
    const { db } = installFakeSupabase({ db: { users: [userRow()] } });
    await saveSlotWeights({ "  ": 30, Dinner: 40 });
    expect(db.users[0].slot_weights).toEqual({ Dinner: 40 });
  });

  it("only writes to the signed-in user's row", async () => {
    const { db } = installFakeSupabase({
      db: {
        users: [userRow(), { id: "someone-else", slot_weights: { Lunch: 50 } }],
      },
    });

    await saveSlotWeights({ Lunch: 20 });

    const other = db.users.find((u) => u.id === "someone-else")!;
    expect(other.slot_weights).toEqual({ Lunch: 50 });
  });
});
