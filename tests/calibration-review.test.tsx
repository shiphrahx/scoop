// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalibrationWrap } from "@/lib/calibrationwrap";

// The review is the one screen a user sees between calibration and their first
// deficit. It has to say what was measured, what the new target is, and start
// nothing until they press the button.

const startDeficit = vi.fn();
vi.mock("@/app/calibration/actions", () => ({
  startDeficit: (...args: unknown[]) => startDeficit(...args),
}));

const CalibrationReview = (await import("@/app/calibration/CalibrationReview")).default;

const wrap = (over: Partial<CalibrationWrap> = {}): CalibrationWrap => ({
  days: 14,
  loggedDays: 13,
  weighInDays: 12,
  measuredMaintenanceKcal: 2400,
  predictedMaintenanceKcal: 2200,
  maintenanceDeltaKcal: 200,
  activeShare: 0.375,
  meanStepsPerDay: 9000,
  meanSleepHours: 7,
  meanIntakeKcal: 2400,
  holdTargetKcal: 2400,
  adherentDays: 12,
  weightChangeKg: 0.1,
  newTarget: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 },
  deficitKcal: 400,
  changeFromHoldKcal: 400,
  holdLossKgPerWeek: 0.1,
  expectedLossKgPerWeek: 0.36,
  inHealthyBand: true,
  projection: {
    points: [
      { week: 0, kg: 80 },
      { week: 1, kg: 79.6 },
      { week: 2, kg: 79.3 },
    ],
    goalWeeks: 16,
    goalDate: "2026-11-29",
  },
  ...over,
});

// Walk to the last card, whatever the findings added up to.
async function toEnd(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 10; i++) {
    const next = screen.queryByRole("button", { name: /next/i });
    if (!next) break;
    await user.click(next);
  }
}

beforeEach(() => startDeficit.mockReset().mockResolvedValue(undefined));
afterEach(cleanup);

describe("calibration review", () => {
  it("opens on what the fortnight was, not on the new target", async () => {
    render(<CalibrationReview wrap={wrap()} name="Sam" />);
    expect(screen.getByText(/Sam, calibration is complete/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "14" })).toBeTruthy();
    expect(screen.getByText(/logged your food on 13 of them/i)).toBeTruthy();
    // The general point is in its own labelled block, not mixed into the above.
    expect(screen.getByText(/^Why this works:/)).toBeTruthy();
  });

  it("shows the measured burn against the formula's guess", async () => {
    const user = userEvent.setup();
    render(<CalibrationReview wrap={wrap()} name={null} />);
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.getByRole("heading", { name: "2,400" })).toBeTruthy();
    expect(screen.getByText(/200 kcal a day warmer than that/i)).toBeTruthy();
  });

  it("states the new target with its macros and the cut behind it", async () => {
    const user = userEvent.setup();
    render(<CalibrationReview wrap={wrap()} name={null} />);
    await toEnd(user);
    // The target card is two back from the end (target → expect → start).
    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByRole("heading", { name: "2,000" })).toBeTruthy();
    expect(screen.getByText(/Protein 150 g/)).toBeTruthy();
    // Both numbers, because the reader can do the subtraction either way.
    expect(screen.getByText(/400 kcal below the 2,400 kcal you burn/i)).toBeTruthy();
    expect(screen.getByText(/400 kcal less food than the 2,400 you're used to/i)).toBeTruthy();
  });

  it("names the cut against the burn AND against what was being eaten", async () => {
    const user = userEvent.setup();
    // The case that read as broken arithmetic: held at 1,700, burns 1,609,
    // now eating 1,378 — a 231 kcal deficit but 322 kcal less food.
    render(
      <CalibrationReview
        wrap={wrap({
          holdTargetKcal: 1700,
          measuredMaintenanceKcal: 1609,
          newTarget: { kcal: 1378, protein_g: 130, carbs_g: 130, fat_g: 43 },
          deficitKcal: 231,
          changeFromHoldKcal: 322,
        })}
        name={null}
      />,
    );
    await toEnd(user);
    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByText(/231 kcal below the 1,609 kcal you burn/i)).toBeTruthy();
    expect(screen.getByText(/322 kcal less food than the 1,700/i)).toBeTruthy();
  });

  it("predicts the weekly loss and when the goal is reached", async () => {
    const user = userEvent.setup();
    render(<CalibrationReview wrap={wrap()} name={null} />);
    await toEnd(user);
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByRole("heading", { name: "0.36" })).toBeTruthy();
    expect(screen.getByText(/29 November 2026/)).toBeTruthy();
    expect(screen.getByText(/goal weight is about 16 weeks away/i)).toBeTruthy();
    // Checkable against the rate they were already losing at, on more food.
    expect(screen.getByText(/already losing about 0.10 kg a week/i)).toBeTruthy();
    // The curve is drawn, and says what it is for a screen reader.
    expect(screen.getByRole("img", { name: /projected weight/i })).toBeTruthy();
  });

  it("changes nothing until the user starts it", async () => {
    const user = userEvent.setup();
    render(<CalibrationReview wrap={wrap()} name={null} />);
    await toEnd(user);

    expect(startDeficit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /start now/i }));
    expect(startDeficit).toHaveBeenCalledTimes(1);
  });

  it("drops the findings it has no data for, and still reaches the target", async () => {
    const user = userEvent.setup();
    render(
      <CalibrationReview
        wrap={wrap({
          measuredMaintenanceKcal: null,
          maintenanceDeltaKcal: null,
          predictedMaintenanceKcal: null,
          activeShare: null,
          meanStepsPerDay: null,
          meanSleepHours: null,
          weightChangeKg: null,
          expectedLossKgPerWeek: null,
          projection: null,
        })}
        name={null}
      />,
    );
    await toEnd(user);

    // Only "the fortnight", "your target" and "start" survive — and the last one
    // is still the button, because the plan must always be reachable.
    expect(screen.getByRole("button", { name: /start now/i })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByRole("heading", { name: "2,000" })).toBeTruthy();
  });

  it("replays a filed review with nothing left to start", async () => {
    const user = userEvent.setup();
    render(
      <CalibrationReview
        wrap={wrap()}
        name="Sam"
        replay
        endedAt="2026-08-09T09:00:00.000Z"
      />,
    );

    // Dated, and addressed to the past rather than to a decision.
    expect(screen.getByText(/Calibration review · 9 August 2026/)).toBeTruthy();
    await toEnd(user);

    expect(screen.queryByRole("button", { name: /start now/i })).toBeNull();
    expect(screen.getByRole("link", { name: /done/i })).toBeTruthy();
    expect(startDeficit).not.toHaveBeenCalled();
  });

  it("says so when starting the deficit fails, and does not pretend it worked", async () => {
    // Once, and as an explicit rejection: a persistent async-throwing mock
    // leaves a rejected promise behind between tests that vitest reports as an
    // unhandled error even though the component handles it.
    startDeficit.mockImplementationOnce(() => Promise.reject(new Error("Network is down.")));
    const user = userEvent.setup();
    render(<CalibrationReview wrap={wrap()} name={null} />);
    await toEnd(user);
    await user.click(screen.getByRole("button", { name: /start now/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("Network is down.");
    // Still on the last card, with the button to try again.
    expect(screen.getByRole("button", { name: /start now/i })).toBeTruthy();
  });
});
