// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/me/actions", () => ({ restartCalibration: vi.fn() }));

const CalibrationSettings = (await import("@/app/(app)/me/CalibrationSettings")).default;

// The review is the one screen that tells a user what their own body turned out
// to be. Once the deficit starts it is gone from Home, so Settings is where it
// has to stay reachable.

afterEach(cleanup);

describe("calibration settings — past reviews", () => {
  it("links to each filed review, newest first", () => {
    render(
      <CalibrationSettings
        calibrating={false}
        daysElapsed={null}
        reviews={[
          { id: "rev-2", endedAt: "2026-08-09T09:00:00.000Z", days: 15, targetKcal: 1506 },
          { id: "rev-1", endedAt: "2026-02-01T09:00:00.000Z", days: 12, targetKcal: 1620 },
        ]}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links[0].getAttribute("href")).toBe("/calibration/rev-2");
    expect(links[1].getAttribute("href")).toBe("/calibration/rev-1");
    expect(screen.getByText(/9 August 2026/)).toBeTruthy();
    expect(
      screen.getByText(/15 days measured · set your target at 1,506 kcal/),
    ).toBeTruthy();
  });

  it("says nothing about history for a user who has never finished a hold", () => {
    render(<CalibrationSettings calibrating daysElapsed={3} reviews={[]} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/calibration reviews/i)).toBeNull();
  });
});
