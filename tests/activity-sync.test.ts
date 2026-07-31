import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getDay is the provider-dispatch call; mock it so the helper is tested in
// isolation from any real Fitbit / Google Health wire calls.
const getDay = vi.fn();
vi.mock("@/lib/fitbit", () => ({ getDay: (...a: unknown[]) => getDay(...a) }));

import { syncActivityDays } from "@/lib/activity-sync";

// A tiny Supabase stand-in that records the upsert call.
function fakeClient() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return {
    upsert,
    from: (table: string) => {
      expect(table).toBe("activity");
      return { upsert };
    },
  };
}

beforeEach(() => {
  getDay.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-24T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("syncActivityDays", () => {
  it("fetches the requested number of days and upserts them for the user", async () => {
    getDay.mockImplementation(async (_token: string, date: string) => ({
      date,
      steps: 8000,
      workout_kcal: 500,
      sleep_hours: 7.2,
    }));

    const client = fakeClient();
    await syncActivityDays(client, "user-1", "access-token", 3);

    // One fetch per day, newest first.
    expect(getDay).toHaveBeenCalledTimes(3);
    expect(getDay.mock.calls.map((c) => c[1])).toEqual([
      "2026-07-24",
      "2026-07-23",
      "2026-07-22",
    ]);

    const [rows, opts] = client.upsert.mock.calls[0];
    expect(opts).toEqual({ onConflict: "user_id,date" });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      date: "2026-07-24",
      steps: 8000,
      workout_kcal: 500,
      sleep_hours: 7.2,
      source: "fitbit",
    });
  });

  it("defaults to a seven-day window", async () => {
    getDay.mockImplementation(async (_token: string, date: string) => ({
      date,
      steps: 100,
      workout_kcal: null,
      sleep_hours: null,
    }));

    const client = fakeClient();
    await syncActivityDays(client, "user-1", "tok");

    expect(getDay).toHaveBeenCalledTimes(7);
    expect(client.upsert.mock.calls[0][0]).toHaveLength(7);
  });

  // A provider error is indistinguishable from an empty day here — both arrive
  // as nulls — so writing them would blank rows an Apple push already filled.
  it("does not write days the provider returned nothing for", async () => {
    getDay.mockImplementation(async (_token: string, date: string) =>
      date === "2026-07-24"
        ? { date, steps: 8000, workout_kcal: null, sleep_hours: null }
        : { date, steps: null, workout_kcal: null, sleep_hours: null },
    );

    const client = fakeClient();
    const result = await syncActivityDays(client, "user-1", "tok", 3);

    expect(client.upsert.mock.calls[0][0]).toEqual([
      expect.objectContaining({ date: "2026-07-24", steps: 8000 }),
    ]);
    expect(result).toEqual({ fetched: 3, written: 1 });
  });

  it("skips the upsert entirely when no day carried data", async () => {
    getDay.mockImplementation(async (_token: string, date: string) => ({
      date,
      steps: null,
      workout_kcal: null,
      sleep_hours: null,
    }));

    const client = fakeClient();
    const result = await syncActivityDays(client, "user-1", "tok", 3);

    expect(client.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ fetched: 3, written: 0 });
  });

  // sleep_hours alone is still a real reading — 0 steps on a rest day must not
  // be mistaken for "the provider told us nothing".
  it("treats a zero reading as data", async () => {
    getDay.mockImplementation(async (_token: string, date: string) => ({
      date,
      steps: 0,
      workout_kcal: null,
      sleep_hours: null,
    }));

    const client = fakeClient();
    const result = await syncActivityDays(client, "user-1", "tok", 1);

    expect(result.written).toBe(1);
  });
});
