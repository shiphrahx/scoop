import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});

const {
  getCustomMilestones,
  getDailyMacros,
  getHighDayDates,
  getInsightsData,
  getNonScaleVictories,
  getTargetHistory,
} = await import("@/lib/queries");

const isoDay = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
const at = (daysAgo: number, hour = 12) =>
  new Date(Date.now() - daysAgo * 86_400_000)
    .toISOString()
    .replace(/T.*/, `T${String(hour).padStart(2, "0")}:00:00.000Z`);

describe("getDailyMacros", () => {
  it("sums every log on a day into one row", async () => {
    installFakeSupabase({
      db: {
        food_logs: [
          {
            user_id: "user-1",
            logged_at: at(1, 8),
            kcal: "500",
            protein_g: "30",
            carbs_g: "60",
            fat_g: "12",
          },
          {
            user_id: "user-1",
            logged_at: at(1, 19),
            kcal: "700",
            protein_g: "45",
            carbs_g: "70",
            fat_g: "20",
          },
        ],
      },
    });

    const days = await getDailyMacros(7);
    expect(days).toHaveLength(1);
    expect(days[0].kcal).toBe(1200);
    expect(days[0].protein_g).toBe(75);
    expect(days[0].carbs_g).toBe(130);
    expect(days[0].fat_g).toBe(32);
  });

  it("returns days oldest first and drops a day with nothing on it", async () => {
    installFakeSupabase({
      db: {
        food_logs: [
          { user_id: "user-1", logged_at: at(1), kcal: "1800", protein_g: "120", carbs_g: "180", fat_g: "50" },
          { user_id: "user-1", logged_at: at(3), kcal: "2000", protein_g: "130", carbs_g: "200", fat_g: "60" },
          { user_id: "user-1", logged_at: at(2), kcal: "0", protein_g: "0", carbs_g: "0", fat_g: "0" },
        ],
      },
    });

    const days = await getDailyMacros(7);
    expect(days.map((d) => d.date)).toEqual([isoDay(3), isoDay(1)]);
  });

  it("is empty with nothing logged", async () => {
    installFakeSupabase({ db: { food_logs: [] } });
    expect(await getDailyMacros(7)).toEqual([]);
  });
});

describe("getTargetHistory", () => {
  it("returns targets oldest first with numbers coerced", async () => {
    installFakeSupabase({
      db: {
        daily_targets: [
          {
            user_id: "user-1",
            week_start: "2026-07-13",
            kcal: "1900",
            protein_g: "150",
            carbs_g: "180",
            fat_g: "55",
          },
          {
            user_id: "user-1",
            week_start: "2026-07-06",
            kcal: "2000",
            protein_g: "150",
            carbs_g: "200",
            fat_g: "60",
          },
        ],
      },
    });

    const targets = await getTargetHistory();
    expect(targets.map((t) => t.week_start)).toEqual(["2026-07-06", "2026-07-13"]);
    expect(targets[0].kcal).toBe(2000);
    expect(targets[1].protein_g).toBe(150);
  });
});

describe("getInsightsData", () => {
  // Issue #55: the dashboard used to pick this week's row out of the raw target
  // history by date. A week the coach hadn't written a row for yet matched
  // nothing, so every day of it scored as a miss. The in-force target is
  // whatever the app itself is holding the user to.
  it("carries the in-force target, not just the row dated this week", async () => {
    installFakeSupabase({
      db: {
        users: [{ id: "user-1", timezone: "UTC", cycling_enabled: false }],
        daily_targets: [
          {
            user_id: "user-1",
            week_start: "2020-01-06",
            kcal: 2000,
            protein_g: 150,
            carbs_g: 200,
            fat_g: 60,
          },
        ],
      },
    });

    const data = await getInsightsData();
    expect(data.currentTarget?.kcal).toBe(2000);
    // No maintenance estimate is possible from an empty profile, so refeeds stay
    // off and every day is scored against the flat target.
    expect(data.cycle.enabled).toBe(false);
  });
});

describe("getHighDayDates", () => {
  it("returns just the dates", async () => {
    installFakeSupabase({
      db: {
        high_days: [
          { user_id: "user-1", date: isoDay(2), week_start: "2026-07-06" },
          { user_id: "user-1", date: isoDay(5), week_start: "2026-07-06" },
        ],
      },
    });
    expect(await getHighDayDates(30)).toEqual([isoDay(5), isoDay(2)]);
  });
});

describe("getNonScaleVictories", () => {
  it("returns the user's wins newest first", async () => {
    installFakeSupabase({
      db: {
        non_scale_victories: [
          { id: "a", user_id: "user-1", date: "2026-07-01", text: "Ran 5k" },
          { id: "b", user_id: "user-1", date: "2026-07-20", text: "Old jeans fit" },
        ],
      },
    });
    const wins = await getNonScaleVictories();
    expect(wins.map((w) => w.text)).toEqual(["Old jeans fit", "Ran 5k"]);
  });
});

describe("getCustomMilestones", () => {
  it("coerces the target weight and keeps a null one null", async () => {
    installFakeSupabase({
      db: {
        custom_milestones: [
          {
            id: "a",
            user_id: "user-1",
            label: "Holiday weight",
            target_weight_kg: "72.5",
            reached_at: null,
            created_at: "2026-07-01",
          },
          {
            id: "b",
            user_id: "user-1",
            label: "Ran 5k",
            target_weight_kg: null,
            reached_at: "2026-07-10",
            created_at: "2026-07-02",
          },
        ],
      },
    });
    const rows = await getCustomMilestones();
    expect(rows[0].target_weight_kg).toBe(72.5);
    expect(rows[1].target_weight_kg).toBeNull();
    expect(rows[1].reached_at).toBe("2026-07-10");
  });
});
