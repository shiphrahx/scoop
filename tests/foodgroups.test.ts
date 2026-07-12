import { describe, expect, it } from "vitest";
import {
  foodRole,
  isCarb,
  isProtein,
  pantryCarbs,
  pantryProteins,
} from "@/lib/foodgroups";

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
