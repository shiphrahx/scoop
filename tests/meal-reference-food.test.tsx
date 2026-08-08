// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodChoice, PlanItem } from "@/lib/types";

// A one-off food with no barcode and no macros the user could recite — a slice
// of cake, a cookie. Open Food Facts is a database of packaged products, so it
// answers those with branded also-rans or nothing; the shared reference is the
// one source that has them, at a portion the user can tap. If the reference
// results don't reach the meal builder, the only way in is typing four macro
// numbers the user would have to look up first.

const searchFoods = vi.fn();
const searchReference = vi.fn();
const searchWeb = vi.fn();
const setMealItems = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/(app)/plan/day/actions", () => ({
  searchFoods: (...args: unknown[]) => searchFoods(...args),
  searchReference: (...args: unknown[]) => searchReference(...args),
  searchWeb: (...args: unknown[]) => searchWeb(...args),
  setMealItems: (...args: unknown[]) => setMealItems(...args),
  setMealPicks: vi.fn(),
  setMealPortions: vi.fn(),
  clearSlot: vi.fn(),
  clearAppPlan: vi.fn(),
  copyFromYesterday: vi.fn(),
  copyMealFromSlot: vi.fn(),
  logPlannedMeal: vi.fn(),
  unlogPlannedMeal: vi.fn(),
  removePlannedMeal: vi.fn(),
  saveFavouriteMeal: vi.fn(),
  addFavouriteMeal: vi.fn(),
}));

const DayPlan = (await import("@/app/(app)/plan/day/DayPlan")).default;

// What searchReference hands back for "cake": no barcode, a default portion of
// one medium slice, and the other slice sizes along for the size chips.
const cakeSlice: FoodChoice = {
  name: "Chocolate Cake Slice",
  source: "off",
  off_barcode: null,
  brand: null,
  kcal_100g: 371,
  protein_100g: 4.5,
  carbs_100g: 51,
  fat_100g: 17,
  fiber_100g: 1.8,
  sugar_100g: 36,
  satfat_100g: 6.5,
  sodium_mg_100g: 320,
  pack_size_g: null,
  unit_g: 95,
  unit_label: "medium chocolate cake slice",
  unit_options: [
    { label: "small", grams: 60 },
    { label: "medium", grams: 95 },
    { label: "large", grams: 130 },
  ],
};

// A branded packaged product OFF offers for the same word — the noise the
// reference has to outrank.
const cakeBar: FoodChoice = {
  ...cakeSlice,
  name: "Cake Bar",
  brand: "Some Brand",
  off_barcode: "5000000000000",
  unit_g: null,
  unit_label: null,
  unit_options: null,
};

const savedItems = (): PlanItem[] => {
  const calls = setMealItems.mock.calls;
  return calls[calls.length - 1]?.[1] ?? [];
};

const renderEmptySlot = () =>
  render(
    <DayPlan
      slots={[{ slot: "Snack", meal: null }]}
      target={null}
      prefs={[]}
      date="2026-08-08"
    />,
  );

beforeEach(() => {
  searchFoods.mockReset().mockResolvedValue([]);
  searchReference.mockReset().mockResolvedValue([cakeSlice]);
  searchWeb.mockReset().mockResolvedValue([]);
  setMealItems.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("meal builder — foods with no barcode", () => {
  it("offers a reference food for a name that has no barcode", async () => {
    const user = userEvent.setup();
    renderEmptySlot();

    await user.type(screen.getByPlaceholderText(/add a food/i), "cake");

    expect(await screen.findByText("Chocolate Cake Slice")).toBeTruthy();
    expect(searchReference).toHaveBeenCalledWith("cake");
  });

  // The whole point: the user never learns what a slice weighs. One tap adds a
  // real portion, and the row says what that portion is before they commit.
  it("shows the portion one tap adds, and adds it at that portion", async () => {
    const user = userEvent.setup();
    renderEmptySlot();

    await user.type(screen.getByPlaceholderText(/add a food/i), "cake");
    // 95 g of a 371 kcal/100g cake = 352 kcal.
    expect(
      await screen.findByText(/1 medium chocolate cake slice · 95 g · 352 kcal/),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /chocolate cake slice/i }));

    await waitFor(() => expect(setMealItems).toHaveBeenCalled());
    expect(savedItems()[0]).toMatchObject({
      name: "Chocolate Cake Slice",
      grams: 95,
      unit_g: 95,
      off_barcode: null,
    });
  });

  // A reference food carries its sizes, so the wrong-sized slice is one tap to
  // fix rather than a grams field to guess at.
  it("switches to a large slice without typing grams", async () => {
    const user = userEvent.setup();
    renderEmptySlot();

    await user.type(screen.getByPlaceholderText(/add a food/i), "cake");
    await user.click(await screen.findByRole("button", { name: /chocolate cake slice/i }));
    await user.click(await screen.findByRole("button", { name: /^large$/i }));

    await waitFor(() =>
      expect(savedItems()[0]).toMatchObject({ grams: 130, unit_g: 130 }),
    );
  });

  // Open Food Facts answers "cake" with branded cake bars. Those are still
  // offered, but under the reference — otherwise the right answer is buried.
  it("puts reference foods above the web results", async () => {
    searchWeb.mockResolvedValue([cakeBar]);
    const user = userEvent.setup();
    renderEmptySlot();

    await user.type(screen.getByPlaceholderText(/add a food/i), "cake");
    await screen.findByText("Cake Bar");

    const shown = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    const reference = shown.findIndex((t) => t.includes("Chocolate Cake Slice"));
    const web = shown.findIndex((t) => t.includes("Cake Bar"));
    expect(reference).toBeGreaterThanOrEqual(0);
    expect(reference).toBeLessThan(web);
  });

  // A typed amount still wins over the food's own portion, as it does for every
  // other source ("50g shreddies").
  it("honours an amount typed with the food", async () => {
    const user = userEvent.setup();
    renderEmptySlot();

    await user.type(screen.getByPlaceholderText(/add a food/i), "40g cake");
    await user.click(await screen.findByRole("button", { name: /chocolate cake slice/i }));

    await waitFor(() => expect(savedItems()[0]).toMatchObject({ grams: 40 }));
  });
});
