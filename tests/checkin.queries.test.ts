import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});

const {
  getCurrentCheckIn,
  getPreviousCheckIn,
  getCheckInHistory,
  getMeasurementHistory,
  getDeviceConnected,
} = await import("@/lib/queries");
const { localWeekStart } = await import("@/lib/time");
const { DEFAULT_TIMEZONE } = await import("@/lib/time");

// getTimezone reads an empty users table → default zone, so this is the week the
// queries treat as "current".
const thisWeek = localWeekStart(DEFAULT_TIMEZONE);
const isoDay = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

describe("getCurrentCheckIn", () => {
  it("returns this week's check-in when one exists", async () => {
    installFakeSupabase({
      db: {
        check_ins: [
          { id: "c", user_id: "user-1", week_start: thisWeek, date: isoDay(0), waist_cm: "84" },
        ],
      },
    });
    const c = await getCurrentCheckIn();
    expect(c?.waist_cm).toBe(84); // numeric string coerced to number
  });

  it("is null when this week hasn't been done", async () => {
    installFakeSupabase({ db: { check_ins: [] } });
    expect(await getCurrentCheckIn()).toBeNull();
  });
});

describe("getPreviousCheckIn", () => {
  it("skips this week and returns the most recent earlier one", async () => {
    installFakeSupabase({
      db: {
        check_ins: [
          { id: "now", user_id: "user-1", week_start: thisWeek, waist_cm: "83" },
          { id: "old", user_id: "user-1", week_start: "2000-01-03", waist_cm: "88" },
        ],
      },
    });
    const prev = await getPreviousCheckIn();
    expect(prev?.id).toBe("old");
  });

  it("accepts an explicit week to look before", async () => {
    installFakeSupabase({
      db: {
        check_ins: [
          { id: "old", user_id: "user-1", week_start: "2000-01-03", waist_cm: "88" },
        ],
      },
    });
    const prev = await getPreviousCheckIn("2010-01-04");
    expect(prev?.id).toBe("old");
    // Nothing earlier than the oldest → null.
    expect(await getPreviousCheckIn("2000-01-03")).toBeNull();
  });
});

describe("getMeasurementHistory", () => {
  it("returns points oldest→newest with coerced numbers", async () => {
    installFakeSupabase({
      db: {
        check_ins: [
          { id: "a", user_id: "user-1", date: isoDay(1), waist_cm: "85", hips_cm: null },
        ],
      },
    });
    const rows = await getMeasurementHistory(30);
    expect(rows[0].waist_cm).toBe(85);
    expect(rows[0].hips_cm).toBeNull();
  });

  it("uses a wide default window when none is given", async () => {
    installFakeSupabase({
      db: {
        check_ins: [
          { id: "a", user_id: "user-1", date: isoDay(200), chest_cm: "100" },
        ],
      },
    });
    const rows = await getMeasurementHistory();
    expect(rows[0].chest_cm).toBe(100);
  });
});

describe("getCheckInHistory", () => {
  it("attaches each check-in's photos with signed URLs", async () => {
    installFakeSupabase({
      db: {
        check_ins: [
          { id: "ci", user_id: "user-1", week_start: thisWeek, date: isoDay(0) },
        ],
        check_in_photos: [
          {
            id: "p",
            check_in_id: "ci",
            user_id: "user-1",
            storage_path: "user-1/ci/a.jpg",
            angle: "front",
          },
        ],
      },
    });
    const hist = await getCheckInHistory();
    expect(hist).toHaveLength(1);
    expect(hist[0].photos[0].signed_url).toContain("signed:");
  });

  it("is empty when there are no check-ins", async () => {
    installFakeSupabase({ db: { check_ins: [] } });
    expect(await getCheckInHistory()).toHaveLength(0);
  });
});

describe("getDeviceConnected", () => {
  it("is true when a Fitbit token row exists", async () => {
    installFakeSupabase({
      db: { fitbit_tokens: [{ user_id: "user-1" }], users: [{ id: "user-1" }] },
    });
    expect(await getDeviceConnected()).toBe(true);
  });

  it("is false with no device linked", async () => {
    installFakeSupabase({ db: { fitbit_tokens: [], users: [{ id: "user-1" }] } });
    expect(await getDeviceConnected()).toBe(false);
  });
});
