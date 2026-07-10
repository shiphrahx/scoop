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
});
