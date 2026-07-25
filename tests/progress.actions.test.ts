import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const {
  logWeight,
  logMeasurements,
  addVictory,
  deleteVictory,
  addMilestone,
  setMilestoneReached,
  deleteMilestone,
} = await import("@/app/(app)/progress/actions");

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

describe("addVictory", () => {
  it("saves a trimmed win against the signed-in user", async () => {
    const { db } = installFakeSupabase({ db: { non_scale_victories: [] } });
    await addVictory("  Ran 5k without stopping  ");
    expect(db.non_scale_victories).toHaveLength(1);
    expect(db.non_scale_victories[0].text).toBe("Ran 5k without stopping");
    expect(db.non_scale_victories[0].user_id).toBe("user-1");
  });

  it("refuses an empty win and one that's an essay", async () => {
    const { db } = installFakeSupabase({ db: { non_scale_victories: [] } });
    await expect(addVictory("   ")).rejects.toThrow(/write what you did/i);
    await expect(addVictory("x".repeat(201))).rejects.toThrow(/200 characters/);
    expect(db.non_scale_victories).toHaveLength(0);
  });

  it("ignores a future date and falls back to today", async () => {
    const { db } = installFakeSupabase({ db: { non_scale_victories: [] } });
    await addVictory("Slept 8 hours", "2999-01-01");
    expect(db.non_scale_victories[0].date).toBe(
      new Date().toISOString().slice(0, 10),
    );
  });
});

describe("deleteVictory", () => {
  it("only deletes the signed-in user's row", async () => {
    const { db } = installFakeSupabase({
      db: {
        non_scale_victories: [
          { id: "mine", user_id: "user-1", date: "2026-07-01", text: "Mine" },
          { id: "theirs", user_id: "user-2", date: "2026-07-01", text: "Theirs" },
        ],
      },
    });
    await deleteVictory("theirs");
    expect(db.non_scale_victories.map((v) => v.id).sort()).toEqual(["mine", "theirs"]);
    await deleteVictory("mine");
    expect(db.non_scale_victories.map((v) => v.id)).toEqual(["theirs"]);
  });
});

describe("custom milestones", () => {
  it("saves one with a target weight and one without", async () => {
    const { db } = installFakeSupabase({ db: { custom_milestones: [] } });
    await addMilestone("Holiday weight", 72.5);
    await addMilestone("  Old jeans  ");
    expect(db.custom_milestones[0].target_weight_kg).toBe(72.5);
    expect(db.custom_milestones[1].label).toBe("Old jeans");
    expect(db.custom_milestones[1].target_weight_kg).toBeNull();
  });

  it("refuses a nameless milestone and an impossible target", async () => {
    const { db } = installFakeSupabase({ db: { custom_milestones: [] } });
    await expect(addMilestone("  ")).rejects.toThrow(/name the milestone/i);
    await expect(addMilestone("Goal", 5)).rejects.toThrow(/target weight/i);
    expect(db.custom_milestones).toHaveLength(0);
  });

  it("ticks a milestone off and back on again", async () => {
    const { db } = installFakeSupabase({
      db: {
        custom_milestones: [
          {
            id: "m",
            user_id: "user-1",
            label: "Ran 5k",
            target_weight_kg: null,
            reached_at: null,
          },
        ],
      },
    });
    await setMilestoneReached("m", true);
    expect(db.custom_milestones[0].reached_at).toBe(
      new Date().toISOString().slice(0, 10),
    );
    await setMilestoneReached("m", false);
    expect(db.custom_milestones[0].reached_at).toBeNull();
  });

  it("only deletes the signed-in user's milestone", async () => {
    const { db } = installFakeSupabase({
      db: {
        custom_milestones: [
          { id: "mine", user_id: "user-1", label: "Mine", target_weight_kg: null },
          { id: "theirs", user_id: "user-2", label: "Theirs", target_weight_kg: null },
        ],
      },
    });
    await deleteMilestone("theirs");
    expect(db.custom_milestones).toHaveLength(2);
    await deleteMilestone("mine");
    expect(db.custom_milestones.map((m) => m.id)).toEqual(["theirs"]);
  });
});
