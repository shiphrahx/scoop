// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoggedFood, Macros } from "@/lib/types";

// A drink went into the food diary but the day screen only ever drew the meal
// slots, so logging one changed nothing the user could see and left the day's
// total reading low. These cover both halves: the drink is on screen, and it
// counts.

const removeFoodLog = vi.fn();

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
  removeFoodLog: (...args: unknown[]) => removeFoodLog(...args),
  saveFavouriteMeal: vi.fn(),
  addFavouriteMeal: vi.fn(),
}));

const DayPlan = (await import("@/app/(app)/plan/day/DayPlan")).default;

const target: Macros = {
  kcal: 2000,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 60,
  fiber_g: 30,
  sugar_g: 50,
  satfat_g: 20,
  sodium_mg: 2300,
};

const drink = (): LoggedFood => ({
  id: "log-1",
  name: "Pint of lager",
  source: "alcohol",
  logged_at: "2026-07-20T19:00:00Z",
  kcal: 210,
  protein_g: 0,
  carbs_g: 52,
  fat_g: 0,
  fiber_g: 0,
  sugar_g: 0,
  satfat_g: 0,
  sodium_mg: 0,
});

function renderDay(extras: LoggedFood[]) {
  render(
    <DayPlan
      slots={[{ slot: "Dinner", meal: null }]}
      extras={extras}
      target={target}
      prefs={[]}
      date="2026-07-20"
    />,
  );
}

beforeEach(() => {
  removeFoodLog.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("the day screen, food logged outside the meal slots", () => {
  it("shows a logged drink by name", () => {
    renderDay([drink()]);
    expect(screen.getByText("Pint of lager")).toBeTruthy();
  });

  it("counts the drink toward the day's total", () => {
    renderDay([drink()]);
    // The header counts the day's calories against the target. Nothing is
    // planned, so the only thing in it is the drink's own 210.
    expect(screen.getByText("210")).toBeTruthy();
    expect(screen.getByText("/ 2000")).toBeTruthy();
  });

  it("says nothing when only meals are planned", () => {
    renderDay([]);
    expect(screen.queryByText(/also logged/i)).toBeNull();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("removes the drink the user deletes", async () => {
    const user = userEvent.setup();
    renderDay([drink()]);

    await user.click(screen.getByRole("button", { name: /remove pint of lager/i }));

    await waitFor(() => expect(removeFoodLog).toHaveBeenCalledWith("log-1"));
  });
});
