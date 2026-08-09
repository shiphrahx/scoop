// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Correlation, MilestoneBoard, WeekScorecard } from "@/lib/insights";

// The Progress dashboard has to fit on a phone AND has to advertise itself: an
// insight with no data yet still takes its place in the grid, naming what the
// user would get for logging a bit more. Hiding those would hide the reason to
// log anything. These tests hold that rule, and the tab/drawer plumbing that
// keeps the rest reachable without stacking full-height cards.

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
  it("still shows every insight to a user with no data, saying what it would tell them", () => {
    render(<DriversTab {...drivers} />);

    // All four driver insights are on the page, none of them hidden for want of
    // data, each one is a pitch for the logging that would fill it in.
    expect(screen.getByText("Sleep and weight loss")).toBeTruthy();
    expect(screen.getByText("Movement and weight loss")).toBeTruthy();
    expect(screen.getByText("Sticking to the plan")).toBeTruthy();
    expect(screen.getByText("High days")).toBeTruthy();

    expect(screen.getByText(/weeks with more sleep are weeks with more loss/i))
      .toBeTruthy();
    expect(screen.getByText(/four weeks of logging against a target/i)).toBeTruthy();
    expect(screen.getByText(/turn calorie cycling on/i)).toBeTruthy();
  });

  it("offers the link on the insights a wearable would unlock", () => {
    render(<DriversTab {...drivers} />);

    // Sleep and movement never fill in by waiting, so they route to /me.
    const links = screen.getAllByRole("link", { name: /connect/i });
    expect(links.length).toBe(2);
    expect(links.every((l) => l.getAttribute("href") === "/me")).toBe(true);
  });

  it("swaps the locked tile for a real card once the data is there", () => {
    render(
      <DriversTab
        {...drivers}
        deviceConnected
        sleep={correlation()}
        sleepSeries={[{ date: "2026-07-24", hours: 7.5 }]}
      />,
    );

    // The contrast, not the coefficient, best weeks against worst.
    expect(screen.getByText("7.8")).toBeTruthy();
    expect(screen.getByText(/6.4 h on your worst/)).toBeTruthy();
    // And the sleep card is no longer pitching itself.
    expect(screen.queryByText(/weeks with more sleep are weeks with more loss/i))
      .toBeNull();
    // The three that still have no data keep their place.
    expect(screen.getByText("Movement and weight loss")).toBeTruthy();
    expect(screen.getByText("High days")).toBeTruthy();
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
    // No rate and no projection yet, so no tile pretends to have one, but the
    // insight itself is still on the page as a locked card, with its pitch.
    expect(screen.queryByText("Per week")).toBeNull();
    expect(screen.getByText("Rate of loss")).toBeTruthy();
    expect(screen.getByText(/how fast you're losing/i)).toBeTruthy();
    expect(screen.getByText("Goal date")).toBeTruthy();
    expect(screen.getByText(/on course to hit your goal/i)).toBeTruthy();
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

    expect(screen.queryByText(/within the healthy band/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Per week/ }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText(/within the healthy band/i)).toBeTruthy();
    expect(within(sheet).getByText("0.42 to 0.84 kg")).toBeTruthy();
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

    // Both panel elements are in the DOM from the start, so the tabs'
    // aria-controls always point at something real.
    // `hidden: true` because a hidden panel is out of the accessibility tree,
    // which is the point of hiding it. Panels come back in DOM order.
    const panels = () => screen.getAllByRole("tabpanel", { hidden: true });

    expect(panels().map((p) => p.hidden)).toEqual([false, true]);
    // A tab nobody has opened yet holds no content: on the real dashboard each
    // one is a screenful of charts, and mounting all four up front made
    // arriving on Progress pay for three the user isn't looking at.
    expect(screen.getByText("overview content")).toBeTruthy();
    expect(screen.queryByText("body content")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Body" }));

    expect(panels().map((p) => p.hidden)).toEqual([true, false]);
    expect(screen.getByText("body content")).toBeTruthy();

    // Once opened it stays mounted, so switching back and forth doesn't rebuild
    // a chart or lose a selection made inside it.
    await user.click(screen.getByRole("tab", { name: "Overview" }));

    expect(panels().map((p) => p.hidden)).toEqual([false, true]);
    expect(screen.getByText("body content")).toBeTruthy();
  });
});
