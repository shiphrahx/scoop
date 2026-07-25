// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Correlation, MilestoneBoard, WeekScorecard } from "@/lib/insights";

// The Progress dashboard has to fit on a phone, and the rule that makes it fit
// is: a card renders only when it has something to say. Everything else — the
// four "needs more data" cards a new user would otherwise scroll past — is one
// line. These tests hold that rule, and the tab/drawer plumbing that makes the
// rest of the insights reachable without stacking them.

vi.mock("@/app/(app)/progress/actions", () => ({
  addMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  setMilestoneReached: vi.fn(),
  addVictory: vi.fn(),
  deleteVictory: vi.fn(),
}));
vi.mock("@/app/(app)/progress/check-in/actions", () => ({
  deleteCheckIn: vi.fn(),
}));

const DriversTab = (await import("@/app/(app)/progress/insights/DriversTab")).default;
const OverviewTab = (await import("@/app/(app)/progress/insights/OverviewTab")).default;
const Tabs = (await import("@/app/(app)/progress/insights/Tabs")).default;

afterEach(cleanup);

const correlation = (over: Partial<Correlation> = {}): Correlation => ({
  r: -0.6,
  n: 6,
  strength: "moderate",
  direction: "helps",
  points: [
    { weekStart: "2026-06-01", x: 7.9, y: 0.6 },
    { weekStart: "2026-06-08", x: 6.2, y: 0.1 },
  ],
  bestWeeksMean: 7.8,
  worstWeeksMean: 6.4,
  ...over,
});

const drivers = {
  sleep: null,
  movement: null,
  adherence: null,
  highDay: null,
  cyclingEnabled: false,
  deviceConnected: false,
  weightSeries: [],
  burnSeries: [],
  sleepSeries: [],
};

const scorecard: WeekScorecard = {
  weekStart: "2026-07-20",
  daysSoFar: 5,
  loggedDays: 5,
  kcalHitDays: 4,
  proteinHitDays: 3,
  streakDays: 12,
};

const emptyBoard: MilestoneBoard = { reached: [], next: null, toNextKg: null };

const overview = {
  today: "2026-07-25",
  trend: [],
  rate: null,
  projection: null,
  progress: null,
  weights: [],
  fatLoss: null,
  plateau: null,
  scorecard,
  hasTarget: false,
  board: emptyBoard,
};

describe("progress dashboard — locked insights", () => {
  it("renders no cards at all for a user with nothing yet, just one line", async () => {
    render(<DriversTab {...drivers} />);

    // Not one of the four driver cards is on the page.
    expect(screen.queryByText("Sleep and weight loss")).toBeNull();
    expect(screen.queryByText("Movement and weight loss")).toBeNull();
    expect(screen.queryByText("Sticking to the plan")).toBeNull();
    expect(screen.queryByText("High days")).toBeNull();

    expect(
      screen.getByRole("button", { name: /4 more insights unlock as you log/ }),
    ).toBeTruthy();
  });

  it("keeps every unlock reason a tap away, device link included", async () => {
    const user = userEvent.setup();
    render(<DriversTab {...drivers} />);

    await user.click(
      screen.getByRole("button", { name: /4 more insights unlock as you log/ }),
    );

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Sleep and weight loss")).toBeTruthy();
    expect(within(sheet).getByText(/four weeks of food logging/i)).toBeTruthy();
    expect(within(sheet).getByText(/calorie cycling is off/i)).toBeTruthy();
    // A wearable insight never unlocks by waiting, so it offers the link.
    expect(within(sheet).getAllByRole("link", { name: /connect a device/i }).length).toBe(
      2,
    );
  });

  it("renders a card once it has data and counts down the locked line", () => {
    render(
      <DriversTab
        {...drivers}
        deviceConnected
        sleep={correlation()}
        sleepSeries={[{ date: "2026-07-24", hours: 7.5 }]}
      />,
    );

    expect(screen.getByText("Sleep and weight loss")).toBeTruthy();
    // The contrast, not the coefficient — best weeks against worst.
    expect(screen.getByText("7.8")).toBeTruthy();
    expect(screen.getByText(/6.4 h on your worst/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /3 more insights unlock as you log/ }),
    ).toBeTruthy();
  });
});

describe("progress dashboard — KPI row", () => {
  it("shows only the figures that have data", () => {
    render(
      <OverviewTab
        {...overview}
        weights={[{ date: "2026-07-25", weight_kg: 84.2 }]}
        progress={{
          startKg: 92,
          currentKg: 84.2,
          goalKg: 78,
          lostKg: 7.8,
          remainingKg: 6.2,
          pctComplete: 56,
          reached: false,
        }}
      />,
    );

    expect(screen.getByText("Now")).toBeTruthy();
    expect(screen.getByText("84.2")).toBeTruthy();
    expect(screen.getByText("To goal")).toBeTruthy();
    // No rate and no projection yet, so neither tile takes up space.
    expect(screen.queryByText("Per week")).toBeNull();
    expect(screen.queryByText("Goal date")).toBeNull();
  });

  it("keeps the detail behind the tile until it's asked for", async () => {
    const user = userEvent.setup();
    render(
      <OverviewTab
        {...overview}
        weights={[{ date: "2026-07-25", weight_kg: 84.2 }]}
        rate={{
          kgPerWeek: 0.6,
          pctPerWeek: 0.71,
          bandMinPct: 0.5,
          bandMaxPct: 1,
          bandMinKg: 0.42,
          bandMaxKg: 0.84,
          verdict: "on-track",
        }}
      />,
    );

    expect(screen.queryByText(/right in the healthy band/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Per week/ }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText(/right in the healthy band/i)).toBeTruthy();
    expect(within(sheet).getByText("0.42–0.84 kg")).toBeTruthy();
  });
});

describe("progress dashboard — tabs", () => {
  it("shows one group at a time and switches between them", async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        tabs={[
          { key: "overview", label: "Overview", content: <p>overview content</p> },
          { key: "body", label: "Body", content: <p>body content</p> },
        ]}
      />,
    );

    // Both panels are in the DOM — the second is hidden, not unmounted, so
    // nothing is lost if the tab state never changes.
    // `hidden: true` because a hidden panel is out of the accessibility tree —
    // which is the point of hiding it. Panels come back in DOM order.
    const panels = () => screen.getAllByRole("tabpanel", { hidden: true });

    expect(screen.getByText("body content")).toBeTruthy();
    expect(panels().map((p) => p.hidden)).toEqual([false, true]);

    await user.click(screen.getByRole("tab", { name: "Body" }));

    expect(panels().map((p) => p.hidden)).toEqual([true, false]);
  });
});
