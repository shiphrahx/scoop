import { describe, expect, it } from "vitest";
import { dietRule, violatesDiet } from "@/lib/ai";

describe("dietRule", () => {
  it("forbids all animal products for vegans", () => {
    expect(dietRule("vegan")).toMatch(/VEGAN/);
    expect(dietRule("vegan")).toMatch(/dairy/i);
  });

  it("allows eggs and dairy for vegetarians", () => {
    expect(dietRule("vegetarian")).toMatch(/eggs and dairy are fine/i);
  });

  it("places no restriction on regular eaters", () => {
    expect(dietRule("regular")).toMatch(/no dietary restriction/i);
  });

  it("allows fish but not meat for pescatarians", () => {
    expect(dietRule("pescatarian")).toMatch(/fish/i);
    expect(dietRule("pescatarian")).toMatch(/meat or poultry/i);
  });

  it("tells keto to keep carbs low", () => {
    expect(dietRule("keto")).toMatch(/carbs very low/i);
  });

  it("demands gluten-free for celiac", () => {
    expect(dietRule("celiac")).toMatch(/gluten-free/i);
  });
});

describe("violatesDiet", () => {
  it("never flags anything for a regular diet", () => {
    expect(violatesDiet("chicken and bacon burger", "regular")).toBe(false);
  });

  it("flags meat for vegetarians", () => {
    expect(violatesDiet("grilled chicken salad", "vegetarian")).toBe(true);
  });

  it("flags fish for vegetarians", () => {
    expect(violatesDiet("tuna pasta bake", "vegetarian")).toBe(true);
  });

  it("allows eggs and cheese for vegetarians", () => {
    expect(violatesDiet("cheese and egg omelette", "vegetarian")).toBe(false);
  });

  it("flags dairy and eggs for vegans", () => {
    expect(violatesDiet("cheese and egg omelette", "vegan")).toBe(true);
    expect(violatesDiet("milk", "vegan")).toBe(true);
    expect(violatesDiet("honey drizzle", "vegan")).toBe(true);
  });

  it("matches plurals via the word boundary", () => {
    expect(violatesDiet("pork sausages", "vegetarian")).toBe(true);
    expect(violatesDiet("prawns", "vegetarian")).toBe(true);
  });

  it("does not match a forbidden word embedded in another word", () => {
    // "hammed" contains no standalone "ham"; word boundary must protect it.
    expect(violatesDiet("hammered oats", "vegan")).toBe(false);
  });

  it("passes a plainly vegan dish", () => {
    expect(violatesDiet("chickpea and spinach curry", "vegan")).toBe(false);
  });

  it("lets pescatarians eat fish but not meat", () => {
    expect(violatesDiet("grilled salmon and greens", "pescatarian")).toBe(false);
    expect(violatesDiet("tuna pasta bake", "pescatarian")).toBe(false);
    expect(violatesDiet("chicken and bacon burger", "pescatarian")).toBe(true);
  });

  it("flags gluten for celiac but passes naturally GF food", () => {
    expect(violatesDiet("wholemeal bread sandwich", "celiac")).toBe(true);
    expect(violatesDiet("beef and barley stew", "celiac")).toBe(true);
    expect(violatesDiet("grilled chicken and rice", "celiac")).toBe(false);
  });

  it("never keyword-flags keto (the carb budget handles it)", () => {
    expect(violatesDiet("bread and pasta with sugar", "keto")).toBe(false);
  });

  it("passes plant-based meat substitutes that carry the meat word", () => {
    expect(violatesDiet("Linda McCartney Vegan Shredded Chicken", "vegan")).toBe(false);
    expect(violatesDiet("Vegetarian Sausages", "vegetarian")).toBe(false);
    expect(violatesDiet("Meat-Free Mince", "vegan")).toBe(false);
    expect(violatesDiet("plant-based bacon", "vegetarian")).toBe(false);
  });

  it("lets pescatarians eat plant-based meat substitutes", () => {
    expect(violatesDiet("Vegan Shredded Chicken", "pescatarian")).toBe(false);
  });

  it("still flags a vegan-labelled food that breaks the gluten guard", () => {
    // Seitan is vegan but wheat-based — plant marker must not clear celiac.
    expect(violatesDiet("Vegan Seitan Wheat Strips", "celiac")).toBe(true);
  });
});
