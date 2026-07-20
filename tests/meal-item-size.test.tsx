// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodChoice, PlanItem } from "@/lib/types";

// Building a meal by hand: a fresh food (banana) carries its named sizes, so the
// user taps "small" instead of typing grams. The size the app saves — its grams
// and unit — is what the day's macros are built from, so the wrong size means the
// wrong plan.

const searchFoods = vi.fn();
const setMealItems = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/(app)/plan/day/actions", () => ({
  searchFoods: (...args: unknown[]) => searchFoods(...args),
  setMealItems: (...args: unknown[]) => setMealItems(...args),
  setMealPortions: vi.fn(),
  clearSlot: vi.fn(),
  clearAppPlan: vi.fn(),
  copyFromYesterday: vi.fn(),
  logPlannedMeal: vi.fn(),
  unlogPlannedMeal: vi.fn(),
  removePlannedMeal: vi.fn(),
}));

const DayPlan = (await import("@/app/(app)/plan/day/DayPlan")).default;

const banana: FoodChoice = {
  name: "banana",
  source: "pantry",
  off_barcode: null,
  brand: null,
  kcal_100g: 89,
  protein_100g: 1.1,
  carbs_100g: 23,
  fat_100g: 0.3,
  fiber_100g: 2.6,
  sugar_100g: 12,
  satfat_100g: 0.1,
  sodium_mg_100g: 1,
  pack_size_g: null,
  unit_g: 118, // medium is the seeded default
  unit_label: "medium banana",
  unit_options: [
    { label: "small", grams: 101 },
    { label: "medium", grams: 118 },
    { label: "large", grams: 136 },
  ],
};

// The items handed to the last setMealItems call.
const savedItems = (): PlanItem[] => {
  const calls = setMealItems.mock.calls;
  return calls[calls.length - 1]?.[1] ?? [];
};

beforeEach(() => {
  searchFoods.mockReset().mockResolvedValue([banana]);
  setMealItems.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

async function addBanana(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(/add a food/i), "banana");
  await user.click(await screen.findByRole("button", { name: /banana/i }));
}

describe("meal builder — fresh food sizes", () => {
  it("adds a banana at the default (medium) size", async () => {
    const user = userEvent.setup();
    render(<DayPlan slots={[{ slot: "Snack", meal: null }]} target={null} prefs={[]} date="2026-07-20" />);

    await addBanana(user);

    await waitFor(() => expect(setMealItems).toHaveBeenCalled());
    expect(savedItems()[0]).toMatchObject({ name: "banana", grams: 118, unit_g: 118 });
  });

  it("switches to a small banana without typing grams", async () => {
    const user = userEvent.setup();
    render(<DayPlan slots={[{ slot: "Snack", meal: null }]} target={null} prefs={[]} date="2026-07-20" />);

    await addBanana(user);
    await user.click(await screen.findByRole("button", { name: /^small$/i }));

    await waitFor(() =>
      expect(savedItems()[0]).toMatchObject({
        grams: 101,
        unit_g: 101,
        unit_label: "small banana",
      }),
    );
  });

  it("reads a cooked staple as a plain count, no '(cooked)s'", async () => {
    const pasta: FoodChoice = {
      ...banana,
      name: "Pasta (cooked)",
      unit_g: 240,
      unit_label: "medium pasta (cooked)",
      unit_options: [
        { label: "small", grams: 180 },
        { label: "medium", grams: 240 },
        { label: "large", grams: 300 },
      ],
    };
    searchFoods.mockResolvedValue([pasta]);
    const user = userEvent.setup();
    render(<DayPlan slots={[{ slot: "Lunch", meal: null }]} target={null} prefs={[]} date="2026-07-20" />);

    await user.type(screen.getByPlaceholderText(/add a food/i), "pasta");
    await user.click(await screen.findByRole("button", { name: /pasta/i }));
    await user.click(await screen.findByRole("button", { name: /one more/i }));

    // 2 servings, and the label is NOT pluralised into "(cooked)s".
    expect(await screen.findByText(/2 medium pasta \(cooked\)/)).toBeTruthy();
    expect(screen.queryByText(/\(cooked\)s/)).toBeNull();
  });

  it("keeps the count when the size changes (2 medium → 2 large)", async () => {
    const user = userEvent.setup();
    render(<DayPlan slots={[{ slot: "Snack", meal: null }]} target={null} prefs={[]} date="2026-07-20" />);

    await addBanana(user);
    // One more medium → 2 mediums (236 g), then swap to large → 2 larges (272 g).
    await user.click(await screen.findByRole("button", { name: /one more/i }));
    await user.click(screen.getByRole("button", { name: /^large$/i }));

    await waitFor(() => expect(savedItems()[0]).toMatchObject({ grams: 272, unit_g: 136 }));
  });
});
