import { describe, expect, it } from "vitest";
import { parseFoodQuery } from "@/lib/foodquery";

// The search box is the front door to logging food: the user types the item and
// the amount together. Two things have to be right, and they fail differently.
//
// A wrong TERM means they can't find the food — annoying, and they'll notice.
// A wrong GRAMS means they find it and log the wrong number of calories, and
// they won't notice at all. This is search UX and macro maths at the same time.

describe("parseFoodQuery", () => {
  it("reads an amount typed in front of the food", () => {
    expect(parseFoodQuery("50g shreddies")).toEqual({ grams: 50, term: "shreddies" });
    expect(parseFoodQuery("200 g chicken breast")).toEqual({
      grams: 200,
      term: "chicken breast",
    });
  });

  it("reads an amount typed after the food", () => {
    expect(parseFoodQuery("rice 200 g")).toEqual({ grams: 200, term: "rice" });
    expect(parseFoodQuery("olive oil 15g")).toEqual({ grams: 15, term: "olive oil" });
  });

  it("converts the units people actually type", () => {
    expect(parseFoodQuery("1.5kg mince").grams).toBe(1500);
    expect(parseFoodQuery("2 oz cheddar").grams).toBe(57); // 2 × 28.35, rounded
    expect(parseFoodQuery("330ml milk").grams).toBe(330);
    expect(parseFoodQuery("1 litre milk").grams).toBe(1000);
  });

  it("takes a decimal amount", () => {
    expect(parseFoodQuery("0.5 kg potatoes").grams).toBe(500);
  });

  it("never returns a zero-gram portion", () => {
    // "0g rice" would otherwise log a food with no weight and no macros, which
    // silently does nothing and looks like the app dropped the entry.
    expect(parseFoodQuery("0g rice").grams).toBe(1);
  });

  it("uses a size word when no weight is given, and searches without it", () => {
    // The size word is an adjective, not part of the food's name — leaving it in
    // means searching the pantry for "medium banana" and finding nothing.
    expect(parseFoodQuery("medium banana")).toEqual({ grams: 120, term: "banana" });
    expect(parseFoodQuery("large egg")).toEqual({ grams: 180, term: "egg" });
    expect(parseFoodQuery("small apple")).toEqual({ grams: 80, term: "apple" });
  });

  it("lets an explicit weight beat a size word", () => {
    // They said 60 g. Believe them, not the "large".
    expect(parseFoodQuery("large egg 60g")).toEqual({ grams: 60, term: "egg" });
  });

  it("asks for no particular amount when none is typed", () => {
    // null (not 0) — the caller then falls back to the pack size or 100 g.
    expect(parseFoodQuery("chicken breast")).toEqual({
      grams: null,
      term: "chicken breast",
    });
  });

  it("does not mistake numbers in a food's name for an amount", () => {
    // The pantry is full of these. "7 up" and "0% fat greek yoghurt" are names,
    // and eating "7 grams of up" is not what was meant.
    expect(parseFoodQuery("0% fat greek yoghurt")).toEqual({
      grams: null,
      term: "0% fat greek yoghurt",
    });
    expect(parseFoodQuery("m&m's")).toEqual({ grams: null, term: "m&m's" });
  });

  it("does not treat a size word inside another word as a size", () => {
    // "Smallgoods" and "Biggie" contain size words but aren't sizes. The regex
    // is word-bounded, so the whole name survives to the search.
    expect(parseFoodQuery("largemouth bass").term).toBe("largemouth bass");
    expect(parseFoodQuery("smallgoods").term).toBe("smallgoods");
  });

  it("copes with whitespace and empty input", () => {
    expect(parseFoodQuery("   ")).toEqual({ grams: null, term: "" });
    expect(parseFoodQuery("  rice  ")).toEqual({ grams: null, term: "rice" });
  });

  it("is case-insensitive about units and sizes", () => {
    expect(parseFoodQuery("200G Rice")).toEqual({ grams: 200, term: "Rice" });
    expect(parseFoodQuery("Medium Banana")).toEqual({ grams: 120, term: "Banana" });
  });
});
