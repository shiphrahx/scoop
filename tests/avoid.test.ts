import { describe, expect, it } from "vitest";
import { isFoodAllowed, matchesAvoided } from "@/lib/ai";

describe("matchesAvoided", () => {
  it("flags a food that contains an avoid term", () => {
    expect(matchesAvoided("Crunchy Peanut Butter", ["peanut"])).toBe(true);
    expect(matchesAvoided("Chestnut Mushrooms", ["mushroom"])).toBe(true);
  });

  it("matches plurals via the word boundary", () => {
    expect(matchesAvoided("Roasted Almonds", ["almond"])).toBe(true);
    expect(matchesAvoided("Mushroom", ["mushrooms"])).toBe(false);
  });

  it("does not match a term embedded in another word", () => {
    // "coconut" must not trip a "nut" avoider via substring.
    expect(matchesAvoided("Coconut Milk", ["nut"])).toBe(false);
  });

  it("is case-insensitive and ignores blank terms", () => {
    expect(matchesAvoided("SALMON FILLET", ["salmon"])).toBe(true);
    expect(matchesAvoided("Anything", ["", "  "])).toBe(false);
  });

  it("returns false when nothing is to be avoided", () => {
    expect(matchesAvoided("Basmati Rice", [])).toBe(false);
    expect(matchesAvoided("Basmati Rice", ["prawn", "olive"])).toBe(false);
  });

  it("survives regex metacharacters in a user term", () => {
    expect(matchesAvoided("Half & half cream", ["half & half"])).toBe(true);
    expect(() => matchesAvoided("anything", ["(bad"])).not.toThrow();
  });
});

describe("isFoodAllowed", () => {
  it("rejects food that breaks the diet", () => {
    expect(isFoodAllowed("Grilled Chicken", "vegan")).toBe(false);
    expect(isFoodAllowed("Basmati Rice", "vegan")).toBe(true);
  });

  it("rejects an allergen even on a permissive diet", () => {
    expect(isFoodAllowed("Peanut Butter", "regular", ["peanut"])).toBe(false);
  });

  it("rejects a dislike", () => {
    expect(isFoodAllowed("Marmite on Toast", "regular", [], ["marmite"])).toBe(
      false,
    );
  });

  it("allows a food that clears diet, allergies and dislikes", () => {
    expect(
      isFoodAllowed("Basmati Rice", "vegan", ["peanut"], ["mushroom"]),
    ).toBe(true);
  });
});
