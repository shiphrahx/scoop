import { describe, expect, it } from "vitest";
import {
  DEFAULT_NUTRIENT_PREFS,
  formatNutrient,
  normalizePrefs,
  valueOf,
} from "@/lib/nutrients";
import type { Macros } from "@/lib/types";

describe("normalizePrefs", () => {
  it("falls back to the default when null", () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_NUTRIENT_PREFS);
  });

  it("falls back to the default when empty", () => {
    expect(normalizePrefs([])).toEqual(DEFAULT_NUTRIENT_PREFS);
  });

  it("keeps only known keys and drops junk", () => {
    expect(normalizePrefs(["protein", "banana", "sodium"])).toEqual([
      "protein",
      "sodium",
    ]);
  });

  it("returns keys in registry order, not input order", () => {
    expect(normalizePrefs(["sodium", "protein", "fiber"])).toEqual([
      "protein",
      "fiber",
      "sodium",
    ]);
  });

  it("falls back when every key is unknown", () => {
    expect(normalizePrefs(["nope", "kcal"])).toEqual(DEFAULT_NUTRIENT_PREFS);
  });

  it("dedupes silently (Set membership)", () => {
    expect(normalizePrefs(["protein", "protein"])).toEqual(["protein"]);
  });
});

describe("valueOf", () => {
  const m: Macros = {
    kcal: 500,
    protein_g: 30,
    carbs_g: 40,
    fat_g: 10,
    sodium_mg: 300,
  };

  it("reads a core field", () => {
    expect(valueOf(m, "protein")).toBe(30);
  });

  it("reads an optional extra field", () => {
    expect(valueOf(m, "sodium")).toBe(300);
  });

  it("returns 0 for a missing optional field", () => {
    expect(valueOf(m, "fiber")).toBe(0);
  });
});

describe("formatNutrient", () => {
  it("shows kcal with no unit suffix", () => {
    expect(formatNutrient(1800.4, "kcal")).toBe("1800");
  });

  it("appends g for gram nutrients", () => {
    expect(formatNutrient(34.6, "protein")).toBe("35 g");
  });

  it("appends mg for sodium", () => {
    expect(formatNutrient(310.2, "sodium")).toBe("310 mg");
  });

  it("rounds to a whole number", () => {
    expect(formatNutrient(0.4, "fiber")).toBe("0 g");
  });
});
