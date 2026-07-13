import { describe, expect, it } from "vitest";
import {
  foodRole,
  isCarb,
  isFat,
  isProtein,
  macroRole,
  pantryCarbs,
  pantryProteins,
} from "@/lib/foodgroups";

describe("macroRole (data-driven)", () => {
  it("classifies by the dominant macro", () => {
    expect(macroRole({ protein_100g: 25, carbs_100g: 0, fat_100g: 3 })).toBe("protein");
    expect(macroRole({ protein_100g: 2.7, carbs_100g: 28, fat_100g: 0.3 })).toBe("carb");
    expect(macroRole({ protein_100g: 0, carbs_100g: 0, fat_100g: 100 })).toBe("fat");
  });

  // Fat carries 9 kcal/g against protein's 4, so a "which macro has the most
  // calories" rule hands most real proteins to the fat pool. These are the foods
  // people actually build a meal around: if they don't land in the protein pool
  // the planner has nothing to hit the protein target with.
  it("treats fatty whole foods as protein sources", () => {
    expect(macroRole({ protein_100g: 20, carbs_100g: 0, fat_100g: 13 })).toBe("protein"); // salmon
    expect(macroRole({ protein_100g: 13, carbs_100g: 1, fat_100g: 11 })).toBe("protein"); // eggs
    expect(macroRole({ protein_100g: 26, carbs_100g: 0, fat_100g: 20 })).toBe("protein"); // beef mince
    expect(macroRole({ protein_100g: 15, carbs_100g: 3, fat_100g: 9 })).toBe("protein"); // firm tofu
  });

  it("still calls a genuine fat a fat, even a high-protein one", () => {
    // These carry real protein but their calories are overwhelmingly fat —
    // anchoring a protein target on them would blow the fat target getting there.
    expect(macroRole({ protein_100g: 25, carbs_100g: 20, fat_100g: 50 })).toBe("fat"); // peanut butter
    expect(macroRole({ protein_100g: 25, carbs_100g: 1, fat_100g: 33 })).toBe("fat"); // cheddar
    expect(macroRole({ protein_100g: 2, carbs_100g: 9, fat_100g: 15 })).toBe("fat"); // avocado
  });

  it("still calls a starch a carb", () => {
    expect(macroRole({ protein_100g: 13, carbs_100g: 67, fat_100g: 7 })).toBe("carb"); // oats
    expect(macroRole({ protein_100g: 5, carbs_100g: 45, fat_100g: 1 })).toBe("carb"); // bread
  });

  it("returns null for negligible-macro foods", () => {
    expect(macroRole({ protein_100g: 1, carbs_100g: 3, fat_100g: 0 })).toBeNull();
  });
});

describe("isFat", () => {
  it("recognises fat sources", () => {
    expect(isFat("Extra Virgin Olive Oil")).toBe(true);
    expect(isFat("Whole Almonds")).toBe(true);
    expect(isFat("Ripe Avocado")).toBe(true);
  });
});

describe("isCarb / isProtein", () => {
  it("recognises base carbs behind brand/marketing words", () => {
    expect(isCarb("Tilda Basmati Rice 1kg")).toBe(true);
    expect(isCarb("Ocado British Baby Potatoes")).toBe(true);
    expect(isCarb("Wholewheat Fusilli Pasta")).toBe(true);
    expect(isCarb("Merchant Gourmet Quinoa")).toBe(true);
    expect(isCarb("Warburtons Seeded Wraps")).toBe(true);
  });

  it("recognises proteins behind brand/marketing words", () => {
    expect(isProtein("M&S British Outdoor Bred Pork Stir Fry Strips")).toBe(true);
    expect(isProtein("Free Range Large Eggs")).toBe(true);
    expect(isProtein("Cauldron Organic Tofu")).toBe(true);
    expect(isProtein("Fage Total Greek Yoghurt")).toBe(true);
    expect(isProtein("Tinned Chickpeas")).toBe(true);
  });

  it("returns false for foods that are neither", () => {
    expect(isCarb("Ocado Aubergine")).toBe(false);
    expect(isProtein("Ocado Aubergine")).toBe(false);
    expect(isCarb("Olive Oil")).toBe(false);
    expect(isProtein("Passata")).toBe(false);
  });
});

describe("foodRole", () => {
  it("prefers protein when a name reads as both", () => {
    expect(foodRole("Chicken Fried Rice")).toBe("protein");
  });
  it("classifies a plain carb and protein", () => {
    expect(foodRole("Jasmine Rice")).toBe("carb");
    expect(foodRole("Salmon Fillets")).toBe("protein");
  });
  it("returns null for a vegetable", () => {
    expect(foodRole("Tenderstem Broccoli")).toBeNull();
  });
});

describe("pantryCarbs / pantryProteins", () => {
  const pantry = [
    "Tilda Basmati Rice",
    "Free Range Eggs",
    "Ocado Aubergine",
    "Cauldron Tofu",
    "Warburtons Wraps",
    "Olive Oil",
  ];
  it("filters the pantry into carbs", () => {
    expect(pantryCarbs(pantry)).toEqual([
      "Tilda Basmati Rice",
      "Warburtons Wraps",
    ]);
  });
  it("filters the pantry into proteins", () => {
    expect(pantryProteins(pantry)).toEqual([
      "Free Range Eggs",
      "Cauldron Tofu",
    ]);
  });
});
