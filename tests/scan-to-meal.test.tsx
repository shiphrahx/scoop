// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodChoice, OffProduct, PlanItem } from "@/lib/types";

// Scanning a barcode used to log the pack on the spot: whatever name Open Food
// Facts holds went straight into the meal, so a bag of crisps landed as "chips"
// with no brand, no macros and no second option. And because the pack carries a
// serving size, the amount was locked to it, a yogurt was one 200 g pot or two,
// never the 150 g actually eaten.
//
// A scan should read like typing the food's name: a list, the barcode's own
// product suggested at the top, and the user free to pick another and to say
// how much of it they ate.

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

// The scanner is a camera component; the only part that matters here is the
// barcode it hands back, so stand in a button that hands one back.
vi.mock("@/components/BarcodeScannerLazy", () => ({
  default: ({ onDetected }: { onDetected: (code: string) => void }) => (
    <button onClick={() => onDetected("5000000000001")}>fake detect</button>
  ),
}));

const DayPlan = (await import("@/app/(app)/plan/day/DayPlan")).default;

// What the barcode itself resolves to: a 200 g pot with a serving on the label.
const scannedYogurt: OffProduct = {
  barcode: "5000000000001",
  name: "Greek Style Yogurt",
  brand: "Ottersgate",
  kcal_100g: 120,
  protein_100g: 9,
  carbs_100g: 5,
  fat_100g: 7,
  fiber_100g: 0,
  sugar_100g: 5,
  satfat_100g: 4,
  sodium_mg_100g: 50,
  pack_size_g: 200,
  unit_g: 200,
  unit_label: "pot",
};

// A different make of the same thing, the one the user might have meant.
const otherYogurt: FoodChoice = {
  name: "Greek Style Yogurt",
  source: "off",
  off_barcode: "5000000000002",
  brand: "Hillfarm",
  kcal_100g: 133,
  protein_100g: 5,
  carbs_100g: 4,
  fat_100g: 10,
  fiber_100g: 0,
  sugar_100g: 4,
  satfat_100g: 7,
  sodium_mg_100g: 45,
  pack_size_g: 500,
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
      date="2026-08-31"
    />,
  );

// Open the scanner and let the fake camera report the barcode.
async function scan(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /scan a barcode/i }));
  await user.click(await screen.findByRole("button", { name: /fake detect/i }));
}

beforeEach(() => {
  searchFoods.mockReset().mockResolvedValue([]);
  searchReference.mockReset().mockResolvedValue([]);
  searchWeb.mockReset().mockResolvedValue([otherYogurt]);
  setMealItems.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => scannedYogurt })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("scanning a barcode into a meal", () => {
  it("offers the scanned pack instead of logging it on the spot", async () => {
    const user = userEvent.setup();
    renderEmptySlot();

    await scan(user);

    expect(await screen.findByText("Scanned")).toBeTruthy();
    // Nothing has been added: the user still has to choose.
    expect(setMealItems).not.toHaveBeenCalled();
  });

  it("names the brand and the macros, not just the product", async () => {
    const user = userEvent.setup();
    renderEmptySlot();

    await scan(user);

    expect(await screen.findByText(/Ottersgate/)).toBeTruthy();
    // 200 g of a 120 kcal/100g yogurt = 240 kcal, 18 g of protein.
    expect(
      await screen.findByText(/240 kcal · Protein 18 g · Carbs 10 g · Fat 14 g/),
    ).toBeTruthy();
  });

  it("offers the other makes of it too, and adds the one picked", async () => {
    const user = userEvent.setup();
    renderEmptySlot();

    await scan(user);

    // The scan searched its own name, so the alternatives arrive with it.
    await waitFor(() => expect(searchWeb).toHaveBeenCalledWith("Greek Style Yogurt"));
    await user.click(await screen.findByText(/Hillfarm/));

    await waitFor(() => expect(setMealItems).toHaveBeenCalled());
    expect(savedItems()[0]).toMatchObject({ off_barcode: "5000000000002" });
  });

  // The reported bug: a scanned pot said "1 portion, 200 g" and that was that.
  it("weighs a scanned pack in grams rather than locking it to the serving", async () => {
    const user = userEvent.setup();
    renderEmptySlot();

    await scan(user);
    await user.click(await screen.findByText(/Ottersgate/));

    // Seeded at the label's serving, but as a weight the user can change.
    const grams = await screen.findByLabelText(/greek style yogurt grams/i);
    expect(screen.queryByRole("button", { name: /one more/i })).toBeNull();

    await user.clear(grams);
    await user.type(grams, "150");

    await waitFor(() => expect(savedItems()[0]).toMatchObject({ grams: 150 }));
  });
});
