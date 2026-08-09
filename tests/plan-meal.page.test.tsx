import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase, type Row } from "./helpers/fake-supabase";
import type { PlannedMeal } from "@/lib/types";

// "Plan this meal" is one route (/plan/day/meal) that shows a different meal per
// ?slot=. To the App Router those are the SAME segment, it keeps client state
// across a change of query on purpose, so the picker has to be given an
// identity of its own, or snack opens holding the foods picked for lunch and
// saving writes them into snack.

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
}));

const plan: PlannedMeal[] = [];
let profile: Row = {
  id: "user-1",
  diet_type: "regular",
  allergies: [],
  dislikes: [],
  meal_slots: ["Breakfast", "Lunch", "Dinner", "Snack"],
};

vi.mock("@/lib/queries", () => ({
  getProfile: async () => profile,
  getTimezone: async () => "Europe/London",
  localToday: async () => "2026-07-26",
  getPlanForDate: async () => plan,
}));

// Stand in for the picker so the page's element tree can be inspected: what is
// asserted here is what the page hands it, and under which React identity.
const MealPickerStub = () => null;
vi.mock("@/app/(app)/plan/day/meal/MealPicker", () => ({ default: MealPickerStub }));

const PlanMealPage = (await import("@/app/(app)/plan/day/meal/page")).default;

const meal = (slot: string, names: string[]): PlannedMeal =>
  ({
    id: `meal-${slot}`,
    date: "2026-07-26",
    slot,
    position: 0,
    origin: "ai",
    name: names.join(", "),
    items: [],
    picks: names.map((name) => ({
      name,
      source: "pantry" as const,
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
    })),
    portions: [],
    swaps: [],
    why: null,
    kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    satfat_g: 0,
    sodium_mg: 0,
    logged_food_id: null,
  }) as PlannedMeal;

// The one <MealPicker> in the page's tree, key included.
function findPicker(node: ReactNode): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findPicker(child);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === MealPickerStub) return node;
  return findPicker((node.props as { children?: ReactNode }).children);
}

async function renderPage(slot: string, date = "2026-07-26") {
  installFakeSupabase({
    db: {
      pantry_items: [
        {
          user_id: "user-1",
          name: "Chicken Breast",
          off_barcode: null,
          kcal_100g: 165,
          protein_100g: 31,
          carbs_100g: 0,
          fat_100g: 4,
          fiber_100g: 0,
          sugar_100g: 0,
          satfat_100g: 0,
          sodium_mg_100g: 0,
          pack_size_g: 500,
          quantity: 1,
          unit_g: null,
          unit_label: null,
        },
      ],
    },
  });
  const el = await PlanMealPage({ searchParams: Promise.resolve({ slot, date }) });
  const picker = findPicker(el);
  expect(picker).not.toBeNull();
  return picker as ReactElement;
}

describe("plan a meal page", () => {
  it("gives each meal its own picker identity, so its picks can't carry over", async () => {
    plan.length = 0;
    const lunch = await renderPage("Lunch");
    const snack = await renderPage("Snack");

    expect(lunch.key).not.toBe(snack.key);
    expect(String(lunch.key)).toContain("Lunch");
    expect(String(snack.key)).toContain("Snack");
  });

  it("separates the same meal on different days too", async () => {
    plan.length = 0;
    const today = await renderPage("Lunch", "2026-07-26");
    const tomorrow = await renderPage("Lunch", "2026-07-27");

    expect(today.key).not.toBe(tomorrow.key);
  });

  it("opens an unplanned meal empty, whatever the other meals hold", async () => {
    plan.length = 0;
    plan.push(meal("Lunch", ["Chicken Breast"]), meal("Dinner", ["Pasta"]));

    const snack = await renderPage("Snack");

    expect((snack.props as { slot: string }).slot).toBe("Snack");
    expect((snack.props as { initial: unknown[] }).initial).toEqual([]);
  });

  it("opens a planned meal on the foods already picked for it", async () => {
    plan.length = 0;
    plan.push(meal("Lunch", ["Chicken Breast"]), meal("Dinner", ["Pasta"]));

    const lunch = await renderPage("Lunch");

    expect(
      (lunch.props as { initial: { name: string }[] }).initial.map((p) => p.name),
    ).toEqual(["Chicken Breast"]);
  });

  it("sends a slot the user hasn't got back to the day plan", async () => {
    plan.length = 0;
    await expect(renderPage("Elevenses")).rejects.toThrow("redirect:/plan/day");
  });

  it("falls back to the default meals when the profile hasn't set any", async () => {
    const saved = profile;
    profile = { ...profile, meal_slots: [] };
    plan.length = 0;
    try {
      const breakfast = await renderPage("Breakfast");
      expect((breakfast.props as { slot: string }).slot).toBe("Breakfast");
    } finally {
      profile = saved;
    }
  });
});
