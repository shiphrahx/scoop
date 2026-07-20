import { describe, expect, it } from "vitest";
import {
  foodRole,
  isCarb,
  isFat,
  isProtein,
  isVegetable,
  macroRole,
  pantryCarbs,
  pantryCategory,
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

describe("isVegetable", () => {
  it("recognises vegetables behind brand words", () => {
    expect(isVegetable("Brown Onions")).toBe(true);
    expect(isVegetable("Tenderstem Broccoli")).toBe(true);
    expect(isVegetable("Organic Courgettes")).toBe(true);
  });
  it("does not read potato or avocado as veg (they are a carb and a fat)", () => {
    expect(isVegetable("Maris Piper Potatoes")).toBe(false);
    expect(isVegetable("Ripe Avocado")).toBe(false);
  });
  it("does not read a plain protein or carb as veg", () => {
    expect(isVegetable("Basmati Rice")).toBe(false);
    expect(isVegetable("Chicken Breast")).toBe(false);
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

describe("pantryCategory", () => {
  const none = { protein_100g: 0, carbs_100g: 0, fat_100g: 0 };

  it("shelves a drink by name, whatever its macros", () => {
    // Milk carries protein but people file it as a drink.
    expect(pantryCategory("Semi-Skimmed Milk", { protein_100g: 3.6, carbs_100g: 4.8, fat_100g: 1.8 })).toBe("Drinks");
    expect(pantryCategory("Innocent Orange Juice", { protein_100g: 0.7, carbs_100g: 8.7, fat_100g: 0.1 })).toBe("Drinks");
    expect(pantryCategory("Sparkling Water", none)).toBe("Drinks");
  });

  it("shelves fruit by name, not its carb macros", () => {
    expect(pantryCategory("Bananas", { protein_100g: 1.1, carbs_100g: 23, fat_100g: 0.3 })).toBe("Fruits");
    expect(pantryCategory("Fresh Strawberries", { protein_100g: 0.7, carbs_100g: 7.7, fat_100g: 0.3 })).toBe("Fruits");
  });

  it("shelves vegetables by name", () => {
    expect(pantryCategory("Tenderstem Broccoli", { protein_100g: 2.8, carbs_100g: 3, fat_100g: 0.4 })).toBe("Vegetables");
    expect(pantryCategory("Bell Peppers", none)).toBe("Vegetables");
  });

  it("shelves the rest by dominant macro", () => {
    expect(pantryCategory("Chicken Breast", { protein_100g: 31, carbs_100g: 0, fat_100g: 3.6 })).toBe("Protein");
    expect(pantryCategory("Basmati Rice", { protein_100g: 2.7, carbs_100g: 28, fat_100g: 0.3 })).toBe("Carbs");
    expect(pantryCategory("Extra Virgin Olive Oil", { protein_100g: 0, carbs_100g: 0, fat_100g: 100 })).toBe("Fat");
  });

  it("reads the name when macros are too light to classify", () => {
    expect(pantryCategory("Whey Protein Isolate", none)).toBe("Protein");
  });

  it("falls back to Other for the unclassifiable", () => {
    expect(pantryCategory("Baking Powder", none)).toBe("Other");
  });
});
