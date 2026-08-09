import { describe, expect, it } from "vitest";
import { computeDaySwap } from "@/lib/mealswap";
import { planPickedDay, type PantryFood } from "@/lib/mealplan";
import type { Macros } from "@/lib/types";

// The smart swap: when the picked foods can't reach the day, the app looks
// through the pantry for ONE trade that would, and offers it. It never applies
// anything itself, and it stays quiet on a day that already lands.

const kcalOf = (p: number, c: number, f: number) => p * 4 + c * 4 + f * 9;

const food = (
  name: string,
  protein_100g: number,
  carbs_100g: number,
  fat_100g: number,
  available_g?: number,
): PantryFood => ({
  name,
  protein_100g,
  carbs_100g,
  fat_100g,
  kcal_100g: kcalOf(protein_100g, carbs_100g, fat_100g),
  available_g,
});

// Cooked staples, the way the pantry stores them.
const rice = (stock?: number) => food("Basmati rice (cooked)", 2.7, 28, 0.3, stock);
const penne = (stock?: number) => food("Penne (cooked)", 6, 31, 1.1, stock);
const chicken = (stock?: number) => food("Vegan Shredded Chicken", 23, 1, 7, stock);
const oil = (stock?: number) => food("Extra virgin olive oil", 0, 0, 100, stock);

const sumDay = (slots: { slot: string; foods: PantryFood[] }[], budget: Macros) =>
  planPickedDay({ slots, budget }).reduce<Macros>(
    (s, m) => ({
      kcal: s.kcal + m.kcal,
      protein_g: s.protein_g + m.protein_g,
      carbs_g: s.carbs_g + m.carbs_g,
      fat_g: s.fat_g + m.fat_g,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

// A budget a set of foods can certainly reach: weigh out real grams of them and
// use the sum, so a day that misses it missed for a reason.
const budgetOf = (parts: { food: PantryFood; grams: number }[]): Macros => ({
  kcal: Math.round(parts.reduce((s, p) => s + (p.food.kcal_100g * p.grams) / 100, 0)),
  protein_g: Math.round(
    parts.reduce((s, p) => s + (p.food.protein_100g * p.grams) / 100, 0),
  ),
  carbs_g: Math.round(parts.reduce((s, p) => s + (p.food.carbs_100g * p.grams) / 100, 0)),
  fat_g: Math.round(parts.reduce((s, p) => s + (p.food.fat_100g * p.grams) / 100, 0)),
});

describe("smart swap", () => {
  // The case from the app: dinner is built around a rice pack with 77 g left in
  // it, so the carbs can't grow and the day sits hundreds of calories short,
  // while a full bag of pasta is sitting in the pantry. The budget is a real
  // plate of that pasta, so the swap has somewhere to land.
  const budget = budgetOf([
    { food: chicken(), grams: 120 },
    { food: penne(), grams: 300 },
  ]);
  const dinner = { slot: "Dinner", foods: [chicken(300), rice(77)] };
  const pantry = [chicken(300), rice(77), penne(500), oil(500)];

  it("offers the pantry food that can actually close the gap", () => {
    const swap = computeDaySwap({ slots: [dinner], budget, pantry });
    expect(swap).not.toBeNull();
    expect(swap!.slot).toBe("Dinner");
    expect(swap!.from).toBe("Basmati rice (cooked)");
    expect(swap!.to).toBe("Penne (cooked)");
  });

  it("lands the day closer than the picks did", () => {
    const swap = computeDaySwap({ slots: [dinner], budget, pantry })!;
    const missBefore = Math.abs(swap.before.kcal - budget.kcal);
    const missAfter = Math.abs(swap.after.kcal - budget.kcal);
    expect(missAfter).toBeLessThan(missBefore - 40);
    // And the promised landing is the real one: re-solving with the swap made
    // gives the same numbers the prompt quoted.
    const swapped = sumDay(
      [{ slot: "Dinner", foods: [chicken(300), penne(500)] }],
      budget,
    );
    expect(swapped).toEqual(swap.after);
  });

  it("says where the day sits and what the trade would do", () => {
    const swap = computeDaySwap({ slots: [dinner], budget, pantry })!;
    expect(swap.reason).toMatch(/under target/);
    expect(swap.summary).toContain("Penne (cooked)");
    expect(swap.summary).toContain("dinner");
  });

  it("stays quiet when the picks already land the day", () => {
    const slots = [{ slot: "Dinner", foods: [chicken(300), penne(500)] }];
    const landed = sumDay(slots, budget);
    expect(Math.abs(landed.kcal - budget.kcal)).toBeLessThan(50);
    expect(computeDaySwap({ slots, budget, pantry })).toBeNull();
  });

  it("never proposes trading a food the user pinned by hand", () => {
    const pinned = { ...rice(77), pinned_g: 77 };
    const swap = computeDaySwap({
      slots: [{ slot: "Dinner", foods: [chicken(300), pinned] }],
      budget,
      pantry,
    });
    expect(swap?.from).not.toBe("Basmati rice (cooked)");
  });

  it("never proposes a food the pantry has no serving of", () => {
    const swap = computeDaySwap({
      slots: [dinner],
      budget,
      pantry: [chicken(300), rice(77), penne(0)],
    });
    expect(swap).toBeNull();
  });

  it("never proposes a food the meal already has", () => {
    const swap = computeDaySwap({
      slots: [{ slot: "Dinner", foods: [chicken(300), rice(77), penne(500)] }],
      budget,
      pantry,
    });
    expect(swap?.to).not.toBe("Penne (cooked)");
  });

  it("trades like for like, not the protein for a carb", () => {
    const swap = computeDaySwap({ slots: [dinner], budget, pantry })!;
    expect(swap.from).not.toBe("Vegan Shredded Chicken");
  });

  it("plans the same day the same way twice", () => {
    const a = computeDaySwap({ slots: [dinner], budget, pantry });
    const b = computeDaySwap({ slots: [dinner], budget, pantry });
    expect(a).toEqual(b);
  });
});
