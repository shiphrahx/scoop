import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});

const {
  getCurrentTargets,
  getTimezone,
  getTodayConsumed,
  hasApiKey,
  hasTrackedToday,
  localToday,
} = await import("@/lib/queries");

afterEach(() => vi.useRealTimers());

// Pin the clock: 00:30 on 14 July in London, which is still 23:30 on the 13th in
// UTC. Every "what day is it" question below has two different right answers
// depending on whose clock you ask, which is the whole point.
function atUkMidnight() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-13T23:30:00Z"));
}

const profile = (tz: string): Row => ({ id: "user-1", timezone: tz });

const log = (loggedAt: string, kcal: number): Row => ({
  user_id: "user-1",
  logged_at: loggedAt,
  kcal,
  protein_g: 10,
  carbs_g: 10,
  fat_g: 5,
  fiber_g: 2,
  sugar_g: 1,
  satfat_g: 1,
  sodium_mg: 100,
});

describe("getTimezone", () => {
  it("reads the zone off the profile", async () => {
    installFakeSupabase({ db: { users: [profile("Europe/London")] } });
    expect(await getTimezone()).toBe("Europe/London");
  });

  it("falls back to UTC for a user with none set", async () => {
    installFakeSupabase({ db: { users: [{ id: "user-1", timezone: null }] } });
    expect(await getTimezone()).toBe("UTC");
  });

  it("falls back to UTC rather than throwing on a junk zone", async () => {
    installFakeSupabase({ db: { users: [profile("Nowhere/Fake")] } });
    expect(await getTimezone()).toBe("UTC");
  });

  it("is UTC when nobody is signed in", async () => {
    installFakeSupabase({ user: null, db: {} });
    expect(await getTimezone()).toBe("UTC");
  });
});

describe("localToday", () => {
  it("is the user's date, not the server's", async () => {
    atUkMidnight();
    installFakeSupabase({ db: { users: [profile("Europe/London")] } });
    expect(await localToday()).toBe("2026-07-14"); // it's already tomorrow there

    installFakeSupabase({ db: { users: [profile("UTC")] } });
    expect(await localToday()).toBe("2026-07-13");
  });
});

describe("getTodayConsumed", () => {
  it("sums today's food from midnight where the user is", async () => {
    atUkMidnight();
    // Eaten at 22:00 UTC on the 13th — which is 23:00 on the 13th in London, so
    // it belongs to YESTERDAY for this user, whose day started at 23:00 UTC.
    // And 23:40 UTC, which is 00:40 on the 14th there: today.
    installFakeSupabase({
      db: {
        users: [profile("Europe/London")],
        food_logs: [
          log("2026-07-13T22:00:00Z", 500), // yesterday, for them
          log("2026-07-13T23:40:00Z", 300), // today, for them
        ],
      },
    });

    const consumed = await getTodayConsumed();
    expect(consumed.kcal).toBe(300);
  });

  it("counts the same food differently for a user in UTC", async () => {
    atUkMidnight();
    // For a UTC user it's still the 13th, and both meals are in that day.
    installFakeSupabase({
      db: {
        users: [profile("UTC")],
        food_logs: [
          log("2026-07-13T22:00:00Z", 500),
          log("2026-07-13T23:40:00Z", 300),
        ],
      },
    });

    expect((await getTodayConsumed()).kcal).toBe(800);
  });

  it("is all zeroes on a day with no food", async () => {
    installFakeSupabase({ db: { users: [profile("UTC")], food_logs: [] } });
    const consumed = await getTodayConsumed();
    expect(consumed).toEqual({
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      satfat_g: 0,
      sodium_mg: 0,
    });
  });

  it("adds up every nutrient across several meals", async () => {
    installFakeSupabase({
      db: {
        users: [profile("UTC")],
        food_logs: [
          log(new Date().toISOString(), 400),
          log(new Date().toISOString(), 350),
        ],
      },
    });

    const consumed = await getTodayConsumed();
    expect(consumed.kcal).toBe(750);
    expect(consumed.protein_g).toBe(20);
    expect(consumed.sodium_mg).toBe(200);
  });
});

describe("hasTrackedToday", () => {
  it("is false before anything is logged", async () => {
    installFakeSupabase({ db: { users: [profile("UTC")], food_logs: [] } });
    expect(await hasTrackedToday()).toBe(false);
  });

  it("is true once something is", async () => {
    installFakeSupabase({
      db: {
        users: [profile("UTC")],
        food_logs: [log(new Date().toISOString(), 400)],
      },
    });
    expect(await hasTrackedToday()).toBe(true);
  });

  it("does not count yesterday's food as today's", async () => {
    atUkMidnight();
    installFakeSupabase({
      db: {
        users: [profile("Europe/London")],
        // 22:00 UTC = 23:00 London on the 13th: before their day began.
        food_logs: [log("2026-07-13T22:00:00Z", 500)],
      },
    });
    expect(await hasTrackedToday()).toBe(false);
  });
});

describe("getCurrentTargets", () => {
  const target = (week: string, kcal: number): Row => ({
    user_id: "user-1",
    week_start: week,
    kcal,
    protein_g: 150,
    carbs_g: 200,
    fat_g: 65,
    fiber_g: 28,
    sugar_g: 50,
    satfat_g: 22,
    sodium_mg: 2300,
  });

  it("returns null before onboarding has set one", async () => {
    installFakeSupabase({ db: { users: [profile("UTC")], daily_targets: [] } });
    expect(await getCurrentTargets()).toBeNull();
  });

  it("prefers this week's target", async () => {
    atUkMidnight();
    installFakeSupabase({
      db: {
        users: [profile("UTC")],
        daily_targets: [target("2026-07-06", 2000), target("2026-06-29", 2200)],
      },
    });
    expect((await getCurrentTargets())!.kcal).toBe(2000);
  });

  it("falls back to the most recent one when this week has none", async () => {
    atUkMidnight();
    installFakeSupabase({
      db: {
        users: [profile("UTC")],
        daily_targets: [target("2026-06-29", 2200)],
      },
    });
    expect((await getCurrentTargets())!.kcal).toBe(2200);
  });

  it("does not hand back a target from a future week", async () => {
    atUkMidnight();
    installFakeSupabase({
      db: {
        users: [profile("UTC")],
        daily_targets: [target("2026-07-06", 2000), target("2026-07-20", 1800)],
      },
    });
    expect((await getCurrentTargets())!.kcal).toBe(2000);
  });
});

describe("hasApiKey", () => {
  it("is false when the user has saved none", async () => {
    installFakeSupabase({
      db: { users: [{ id: "user-1", anthropic_api_key: null }] },
    });
    expect(await hasApiKey()).toBe(false);
  });

  it("is true when one is stored, without handing the key back", async () => {
    installFakeSupabase({
      db: { users: [{ id: "user-1", anthropic_api_key: "enc.v1.abc" }] },
    });
    expect(await hasApiKey()).toBe(true);
  });

  it("is false when nobody is signed in", async () => {
    installFakeSupabase({ user: null, db: {} });
    expect(await hasApiKey()).toBe(false);
  });
});
