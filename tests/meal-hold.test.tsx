// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MealPick, PlannedMeal } from "@/lib/types";

// Issue #58: an amount the user sets by hand is theirs, and a rebalance must
// re-portion the rest of the day around it rather than overwriting it. The
// server holds a pinned food on every build; this covers the editor half — what
// the save writes as pinned, and the one control that hands a food back.

const setMealPortions = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/(app)/plan/day/actions", () => ({
  searchFoods: vi.fn(async () => []),
  searchReference: vi.fn(async () => []),
  searchWeb: vi.fn(async () => []),
  setMealItems: vi.fn(),
  setMealPicks: vi.fn(),
  setMealPortions: (...args: unknown[]) => setMealPortions(...args),
  clearSlot: vi.fn(),
  clearAppPlan: vi.fn(),
  copyFromYesterday: vi.fn(),
  copyMealFromSlot: vi.fn(),
  logPlannedMeal: vi.fn(),
  unlogPlannedMeal: vi.fn(),
  removePlannedMeal: vi.fn(),
  saveFavouriteMeal: vi.fn(),
}));

const DayPlan = (await import("@/app/(app)/plan/day/DayPlan")).default;

const pick = (name: string, pinned_g: number | null): MealPick =>
  ({
    name,
    source: "pantry",
    off_barcode: null,
    kcal_100g: 100,
    protein_100g: 10,
    carbs_100g: 10,
    fat_100g: 1,
    fiber_100g: 0,
    sugar_100g: 0,
    satfat_100g: 0,
    sodium_mg_100g: 0,
    pack_size_g: null,
    unit_g: null,
    unit_label: null,
    unit_options: null,
    pinned_g,
  }) as MealPick;

// A built dish: tofu already held at the 220 g the user set, pasta free for the
// app to size.
const meal = (): PlannedMeal => ({
  id: "m1",
  date: "2026-07-20",
  slot: "Dinner",
  position: 0,
  origin: "ai",
  name: "Tofu with Pasta",
  items: [],
  picks: [pick("tofu", 220), pick("Pasta", null)],
  portions: [
    { name: "Tofu", grams: 220, kcal: 299, protein_g: 31, carbs_g: 4, fat_g: 18 },
    { name: "Pasta", grams: 150, kcal: 557, protein_g: 20, carbs_g: 107, fat_g: 2 },
  ],
  swaps: [],
  why: null,
  logged_food_id: null,
  kcal: 856,
  protein_g: 51,
  carbs_g: 111,
  fat_g: 20,
  fiber_g: 0,
  sugar_g: 0,
  satfat_g: 0,
  sodium_mg: 0,
});

// The names the last save marked as hand-set.
const pinnedNames = (): string[] => {
  const calls = setMealPortions.mock.calls;
  return (calls[calls.length - 1]?.[2] as string[]) ?? [];
};

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^edit$/i }));
}

function renderPlan() {
  render(
    <DayPlan
      slots={[{ slot: "Dinner", meal: meal() }]}
      target={null}
      prefs={[]}
      date="2026-07-20"
    />,
  );
}

beforeEach(() => {
  setMealPortions.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("meal editor — held amounts", () => {
  // The pick is stored as "tofu" and the build renamed the portion to "Tofu".
  // Matched by exact name the hold would be invisible, and the save below would
  // silently drop it.
  it("shows a food already held, matching the pick case-insensitively", async () => {
    const user = userEvent.setup();
    renderPlan();
    await openEditor(user);

    expect(screen.getAllByText(/held at your amount/i)).toHaveLength(1);
  });

  // The save writes the WHOLE pinned set, so a hold that isn't carried into the
  // editor is a hold that editing anything else quietly throws away.
  it("keeps an existing hold when a different ingredient is edited", async () => {
    const user = userEvent.setup();
    renderPlan();
    await openEditor(user);

    await user.clear(screen.getByLabelText(/pasta grams/i));
    await user.type(screen.getByLabelText(/pasta grams/i), "120");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(setMealPortions).toHaveBeenCalled());
    expect(pinnedNames().sort()).toEqual(["Pasta", "Tofu"]);
  });

  // The only way out of a hold, now that a rebalance never spends one.
  it("hands a held food back to the app when released", async () => {
    const user = userEvent.setup();
    renderPlan();
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: /let the app size it/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(setMealPortions).toHaveBeenCalled());
    expect(pinnedNames()).toEqual([]);
    expect(screen.queryByText(/held at your amount/i)).toBeNull();
  });
});
