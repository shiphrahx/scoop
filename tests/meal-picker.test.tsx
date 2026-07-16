// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MealPick } from "@/lib/types";

// "Plan this meal": the user picks the foods for ONE meal; what this component
// saves is exactly what the day build will portion. A pick that doesn't stick,
// or one that survives being un-tapped, changes what the user is told to eat.

const setMealPicks = vi.fn();
const searchFoods = vi.fn();
const addPantryItem = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/(app)/plan/day/actions", () => ({
  setMealPicks: (...args: unknown[]) => setMealPicks(...args),
  searchFoods: (...args: unknown[]) => searchFoods(...args),
}));
vi.mock("@/app/(app)/pantry/actions", () => ({
  addPantryItem: (...args: unknown[]) => addPantryItem(...args),
}));
// The scanner reaches for a camera, which jsdom hasn't got. Render a stand-in
// button that "scans" a fixed barcode so the flow can be driven.
vi.mock("@/components/BarcodeScanner", () => ({
  default: ({ onDetected }: { onDetected: (code: string) => void }) => (
    <button onClick={() => onDetected("5000000000000")}>fake-scan</button>
  ),
}));

const MealPicker = (await import("@/app/(app)/plan/day/meal/MealPicker")).default;

const pick = (name: string, over: Partial<MealPick> = {}): MealPick => ({
  name,
  source: "pantry",
  off_barcode: null,
  kcal_100g: 100,
  protein_100g: 10,
  carbs_100g: 10,
  fat_100g: 2,
  fiber_100g: 0,
  sugar_100g: 0,
  satfat_100g: 0,
  sodium_mg_100g: 0,
  pack_size_g: null,
  ...over,
});

const groups = {
  protein: [pick("Firm Tofu"), pick("Chicken Breast")],
  carb: [pick("Pasta")],
  fat: [pick("Olive Oil")],
  other: [pick("Passata")],
};

beforeEach(() => {
  setMealPicks.mockReset().mockResolvedValue(undefined);
  searchFoods.mockReset().mockResolvedValue([]);
  addPantryItem.mockReset().mockResolvedValue(undefined);
  push.mockReset();
});
afterEach(cleanup);

const save = () => screen.getByRole("button", { name: /save this meal/i });

// The picks handed to the action — second argument of the call.
const savedPicks = (): MealPick[] => setMealPicks.mock.calls[0]?.[1] ?? [];

describe("MealPicker", () => {
  it("saves the foods the user tapped, for the right slot", async () => {
    const user = userEvent.setup();
    render(<MealPicker slot="Lunch" groups={groups} initial={[]} />);

    await user.click(screen.getByRole("button", { name: /^pasta$/i }));
    await user.click(screen.getByRole("button", { name: /^firm tofu$/i }));
    await user.click(save());

    expect(setMealPicks).toHaveBeenCalledTimes(1);
    expect(setMealPicks.mock.calls[0][0]).toBe("Lunch");
    expect(savedPicks().map((p) => p.name)).toEqual(["Pasta", "Firm Tofu"]);
    expect(push).toHaveBeenCalledWith("/plan/day");
  });

  it("un-taps a food and does not save it", async () => {
    const user = userEvent.setup();
    render(<MealPicker slot="Lunch" groups={groups} initial={[]} />);

    await user.click(screen.getByRole("button", { name: /^pasta$/i }));
    await user.click(screen.getByRole("button", { name: /^olive oil$/i }));
    // Think better of the oil: chips of picked foods also appear in the "This
    // meal" list — un-tap the chip in the grid.
    const oilButtons = screen.getAllByRole("button", { name: /olive oil/i });
    await user.click(oilButtons[oilButtons.length - 1]);
    await user.click(save());

    expect(savedPicks().map((p) => p.name)).toEqual(["Pasta"]);
  });

  it("starts from the picks already saved for the slot", async () => {
    const user = userEvent.setup();
    render(
      <MealPicker slot="Dinner" groups={groups} initial={[pick("Bagel", { source: "off" })]} />,
    );

    expect(screen.getByText(/bagel/i)).toBeTruthy();
    await user.click(save());
    expect(savedPicks().map((p) => p.name)).toEqual(["Bagel"]);
  });

  it("clears the meal when every pick is removed", async () => {
    const user = userEvent.setup();
    render(<MealPicker slot="Dinner" groups={groups} initial={[pick("Pasta")]} />);

    // Remove the only pick (the chip in "This meal"), then save the empty list.
    const pastaButtons = screen.getAllByRole("button", { name: /pasta/i });
    await user.click(pastaButtons[0]);
    await user.click(screen.getByRole("button", { name: /clear this meal/i }));

    expect(setMealPicks).toHaveBeenCalledTimes(1);
    expect(savedPicks()).toEqual([]);
  });

  it("passes the date through so another day's meal lands on that day", async () => {
    const user = userEvent.setup();
    render(
      <MealPicker slot="Lunch" date="2026-07-20" groups={groups} initial={[]} />,
    );

    await user.click(screen.getByRole("button", { name: /^pasta$/i }));
    await user.click(save());

    expect(setMealPicks.mock.calls[0][2]).toBe("2026-07-20");
    expect(push).toHaveBeenCalledWith("/plan/day?date=2026-07-20");
  });

  it("shows the reason when saving fails, and stays put", async () => {
    setMealPicks.mockRejectedValue(
      new Error("This meal is already logged — edit it from the plan instead."),
    );
    const user = userEvent.setup();
    render(<MealPicker slot="Lunch" groups={groups} initial={[]} />);

    await user.click(screen.getByRole("button", { name: /^pasta$/i }));
    await user.click(save());

    expect(await screen.findByText(/already logged/i)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("adds a scanned product as a pick and offers the pantry", async () => {
    const product = {
      barcode: "5000000000000",
      name: "Rye Bagel",
      kcal_100g: 250,
      protein_100g: 9,
      carbs_100g: 48,
      fat_100g: 1.5,
      fiber_100g: 4,
      sugar_100g: 5,
      satfat_100g: 0.3,
      sodium_mg_100g: 430,
      pack_size_g: 340,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => product }),
    );

    const user = userEvent.setup();
    render(<MealPicker slot="Dinner" groups={groups} initial={[]} />);

    await user.click(screen.getByRole("button", { name: /scan a barcode/i }));
    await user.click(screen.getByRole("button", { name: /fake-scan/i }));

    // Picked, and the pantry offer is up (its Yes/No buttons exist).
    await user.click(await screen.findByRole("button", { name: /^yes$/i }));
    expect(addPantryItem).toHaveBeenCalledTimes(1);
    expect(addPantryItem.mock.calls[0][0]).toMatchObject({
      name: "Rye Bagel",
      off_barcode: "5000000000000",
      quantity: 1,
    });

    await user.click(save());
    expect(savedPicks().map((p) => p.name)).toEqual(["Rye Bagel"]);

    vi.unstubAllGlobals();
  });

  it("declining the pantry offer keeps the pick but writes nothing", async () => {
    const product = {
      barcode: "5000000000000",
      name: "Rye Bagel",
      kcal_100g: 250,
      protein_100g: 9,
      carbs_100g: 48,
      fat_100g: 1.5,
      fiber_100g: 4,
      sugar_100g: 5,
      satfat_100g: 0.3,
      sodium_mg_100g: 430,
      pack_size_g: 340,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => product }),
    );

    const user = userEvent.setup();
    render(<MealPicker slot="Dinner" groups={groups} initial={[]} />);

    await user.click(screen.getByRole("button", { name: /scan a barcode/i }));
    await user.click(screen.getByRole("button", { name: /fake-scan/i }));
    await user.click(await screen.findByRole("button", { name: /^no$/i }));

    expect(addPantryItem).not.toHaveBeenCalled();
    await user.click(save());
    expect(savedPicks().map((p) => p.name)).toEqual(["Rye Bagel"]);

    vi.unstubAllGlobals();
  });
});
