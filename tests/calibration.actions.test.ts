import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";
import { graduatingUserDb } from "./helpers/calibration";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
}));

const { startDeficit } = await import("@/app/calibration/actions");
const { getCalibrationReview, getCalibrationReviews } = await import("@/lib/queries");

// Starting the deficit does two things that must not come apart: it writes the
// target, and it files the review the user was shown. The review cannot be
// rebuilt afterwards, every input it was computed from has moved on, so if it
// isn't captured here it is gone.

// The action ends in a redirect, which Next implements by throwing.
async function run() {
  await expect(startDeficit()).rejects.toThrow("redirect:/");
}

describe("startDeficit", () => {
  it("writes the graduating target", async () => {
    const fake = installFakeSupabase({ db: graduatingUserDb() });
    await run();

    const written = fake.db.daily_targets.filter((t) => t.phase === "deficit");
    expect(written.length).toBe(1);
    expect(Number(written[0].kcal)).toBeLessThan(1700);
  });

  it("files the review it showed, with the fortnight it was about", async () => {
    const fake = installFakeSupabase({ db: graduatingUserDb() });
    await run();

    expect(fake.db.calibration_reviews.length).toBe(1);
    const row = fake.db.calibration_reviews[0];
    expect(row.user_id).toBe("user-1");
    expect(row.days).toBe(15);
    expect(row.started_at).toBeTruthy();

    // The findings are the snapshot the screen rendered, not a pointer to data
    // that will have moved by the time it's read back.
    const findings = row.findings as { newTarget: { kcal: number }; deficitKcal: number };
    expect(findings.deficitKcal).toBeGreaterThan(0);
    expect(findings.newTarget.kcal).toBeLessThan(1700);
  });

  it("hands the filed review back to be re-watched", async () => {
    installFakeSupabase({ db: graduatingUserDb() });
    await run();

    const [filed] = await getCalibrationReviews();
    expect(filed.days).toBe(15);
    expect(filed.findings.newTarget.kcal).toBeLessThan(1700);

    const again = await getCalibrationReview(filed.id);
    expect(again?.findings.newTarget.kcal).toBe(filed.findings.newTarget.kcal);
    expect(await getCalibrationReview("not-a-review")).toBeNull();
  });

  it("files nothing for a user with no review pending", async () => {
    // Hold still running: there is no review, and applyReview has nothing to
    // graduate.
    const fake = installFakeSupabase({
      db: graduatingUserDb({
        calibration_started_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      }),
    });
    await run();

    expect(fake.db.calibration_reviews.length).toBe(0);
  });
});
