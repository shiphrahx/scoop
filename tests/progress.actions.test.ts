import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { logWeight, logMeasurements } = await import("@/app/(app)/progress/actions");

describe("logWeight", () => {
  it("saves a weigh-in", async () => {
    const { db } = installFakeSupabase({ db: { weights: [] } });
    await logWeight(82.4);
    expect(db.weights).toHaveLength(1);
    expect(db.weights[0].weight_kg).toBe(82.4);
  });

  it("back-fills a day the user forgot", async () => {
    const { db } = installFakeSupabase({ db: { weights: [] } });
    await logWeight(82.4, "2026-07-10");
    expect(db.weights[0].date).toBe("2026-07-10");
  });

  it("ignores a future date rather than logging into next week", async () => {
    const { db } = installFakeSupabase({ db: { weights: [] } });
    await logWeight(82.4, "2099-01-01");
    // Falls back to the DB default (today) instead of taking the bad date.
    expect(db.weights[0].date).toBeUndefined();
  });

  // Every weigh-in is averaged over the week, and the coach cuts or raises the
  // user's calories off that average. Junk in here doesn't throw anywhere — it
  // silently changes what they're told to eat.
  it("rejects a weight that isn't a number", async () => {
    const { db } = installFakeSupabase({ db: { weights: [] } });
    await expect(logWeight(Number.NaN)).rejects.toThrow(/weight/i);
    expect(db.weights).toHaveLength(0);
  });

  it("rejects an impossible weight", async () => {
    const { db } = installFakeSupabase({ db: { weights: [] } });
    await expect(logWeight(0)).rejects.toThrow(/weight/i);
    await expect(logWeight(-70)).rejects.toThrow(/weight/i);
    await expect(logWeight(900)).rejects.toThrow(/weight/i);
    expect(db.weights).toHaveLength(0);
  });

  it("accepts the extremes of a believable range", async () => {
    installFakeSupabase({ db: { weights: [] } });
    await expect(logWeight(20)).resolves.not.toThrow();
    await expect(logWeight(500)).resolves.not.toThrow();
  });
});

describe("logMeasurements", () => {
  const empty = {
    chest_cm: null,
    waist_cm: null,
    arms_cm: null,
    thighs_cm: null,
    hips_cm: null,
  };

  it("saves the measurements taken, leaving the rest null", async () => {
    const { db } = installFakeSupabase({ db: { measurements: [] } });
    await logMeasurements({ ...empty, waist_cm: 86, hips_cm: 95 });
    expect(db.measurements[0].waist_cm).toBe(86);
    expect(db.measurements[0].arms_cm).toBeNull();
  });

  it("rejects a junk measurement", async () => {
    // The waist reading is what lets the coach say "the scale is flat but you're
    // losing fat" and hold the calorie target rather than cutting it.
    const { db } = installFakeSupabase({ db: { measurements: [] } });
    await expect(
      logMeasurements({ ...empty, waist_cm: Number.NaN }),
    ).rejects.toThrow(/waist/i);
    await expect(logMeasurements({ ...empty, waist_cm: -5 })).rejects.toThrow();
    expect(db.measurements).toHaveLength(0);
  });
});
