// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The build button used to sit above the whole meal list, so after picking the
// last meal the user had to scroll back up to the top to build the day. It now
// sits under the last meal, where they already are (#83).

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/(app)/plan/day/actions", () => ({
  searchFoods: vi.fn(async () => []),
  searchReference: vi.fn(async () => []),
  searchWeb: vi.fn(async () => []),
  setMealItems: vi.fn(),
  setMealPicks: vi.fn(),
  setMealPortions: vi.fn(),
  clearSlot: vi.fn(),
  clearAppPlan: vi.fn(),
  copyFromYesterday: vi.fn(),
  copyMealFromSlot: vi.fn(),
  logPlannedMeal: vi.fn(),
  unlogPlannedMeal: vi.fn(),
  removePlannedMeal: vi.fn(),
  removeFoodLog: vi.fn(),
  saveFavouriteMeal: vi.fn(),
  addFavouriteMeal: vi.fn(),
}));

const DayPlan = (await import("@/app/(app)/plan/day/DayPlan")).default;

afterEach(cleanup);

describe("the day plan's build button", () => {
  it("comes after the last meal, not above the list", () => {
    render(
      <DayPlan
        slots={[
          { slot: "Breakfast", meal: null },
          { slot: "Dinner", meal: null },
        ]}
        target={null}
        prefs={[]}
        date="2026-10-21"
        buildCard={<button>Build my day</button>}
      />,
    );
    const build = screen.getByRole("button", { name: "Build my day" });
    const dinner = screen.getByText("Dinner");
    expect(
      dinner.compareDocumentPosition(build) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
