import { describe, expect, it } from "vitest";
import {
  DEFAULT_NUTRIENT_PREFS,
  formatNutrient,
  normalizePrefs,
  nutrientFit,
  valueOf,
  worstFit,
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

// How close a plan has to land before the day page calls it good. The rule the
// user asked for: within 5 g either way is fine, up to 10 g is a warning, past
// that it needs changing. These decide the colour of every tile and the verdict
// line under the plan, and had no tests at all.
describe("nutrientFit", () => {
  const target: Macros = {
    kcal: 2000,
    protein_g: 150,
    carbs_g: 200,
    fat_g: 65,
    fiber_g: 28,
    sugar_g: 50,
    satfat_g: 22,
    sodium_mg: 2300,
  };
  const plan = (over: Partial<Macros>): Macros => ({ ...target, ...over });

  it("calls a plan on target when it is within 5 g", () => {
    expect(nutrientFit(plan({ protein_g: 155 }), target, "protein")!.status).toBe("ok");
    expect(nutrientFit(plan({ protein_g: 145 }), target, "protein")!.status).toBe("ok");
  });

  it("warns between 5 g and 10 g out", () => {
    expect(nutrientFit(plan({ protein_g: 160 }), target, "protein")!.status).toBe("warn");
    expect(nutrientFit(plan({ protein_g: 140 }), target, "protein")!.status).toBe("warn");
  });

  it("calls it off past 10 g", () => {
    expect(nutrientFit(plan({ protein_g: 161 }), target, "protein")!.status).toBe("off");
    expect(nutrientFit(plan({ protein_g: 100 }), target, "protein")!.status).toBe("off");
  });

  it("signs the difference: + is over the target, - is under", () => {
    expect(nutrientFit(plan({ protein_g: 160 }), target, "protein")!.diff).toBe(10);
    expect(nutrientFit(plan({ protein_g: 140 }), target, "protein")!.diff).toBe(-10);
  });

  it("only judges a limit when you go OVER it", () => {
    // Sugar, saturates and sodium are ceilings. Being far under a sugar limit is
    // the point of the diet, not a miss — flagging it would tell the user to eat
    // more sugar to hit target.
    expect(nutrientFit(plan({ sugar_g: 0 }), target, "sugar")!.status).toBe("ok");
    expect(nutrientFit(plan({ satfat_g: 0 }), target, "satfat")!.status).toBe("ok");
    expect(nutrientFit(plan({ sodium_mg: 0 }), target, "sodium")!.status).toBe("ok");
    // But going over one is still a miss.
    expect(nutrientFit(plan({ sugar_g: 65 }), target, "sugar")!.status).toBe("off");
  });

  it("judges a goal in both directions", () => {
    // Fibre is a floor to reach, so falling short of it IS a miss.
    expect(nutrientFit(plan({ fiber_g: 10 }), target, "fiber")!.status).toBe("off");
  });

  it("scales the tolerance for calories and milligrams", () => {
    // 5 g of protein and 5 kcal are not the same size of miss. kcal gets 50/100
    // and sodium 100/200, so a rounding-sized gap on a big number isn't flagged.
    expect(nutrientFit(plan({ kcal: 2040 }), target, "kcal")!.status).toBe("ok");
    expect(nutrientFit(plan({ kcal: 2090 }), target, "kcal")!.status).toBe("warn");
    expect(nutrientFit(plan({ kcal: 2200 }), target, "kcal")!.status).toBe("off");
    expect(nutrientFit(plan({ sodium_mg: 2380 }), target, "sodium")!.status).toBe("ok");
    expect(nutrientFit(plan({ sodium_mg: 2600 }), target, "sodium")!.status).toBe("off");
  });

  it("has no opinion without a target to judge against", () => {
    expect(nutrientFit(plan({}), null, "protein")).toBeNull();
    // A target of 0 is 'not set', not 'eat none of it'.
    expect(nutrientFit(plan({}), { ...target, fiber_g: 0 }, "fiber")).toBeNull();
  });
});

describe("worstFit", () => {
  const target: Macros = {
    kcal: 2000,
    protein_g: 150,
    carbs_g: 200,
    fat_g: 65,
  };

  it("is ok only when every nutrient is ok", () => {
    const plan: Macros = { kcal: 2000, protein_g: 152, carbs_g: 198, fat_g: 64 };
    expect(worstFit(plan, target, ["protein", "carbs", "fat"])).toBe("ok");
  });

  it("takes the worst of them, not the average", () => {
    // Protein and carbs are perfect but fat is 30 g out. The day is off — an
    // average would have called this fine and let the user cook it.
    const plan: Macros = { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 95 };
    expect(worstFit(plan, target, ["protein", "carbs", "fat"])).toBe("off");
  });

  it("reports a warning when the worst miss is only a warning", () => {
    const plan: Macros = { kcal: 2000, protein_g: 158, carbs_g: 200, fat_g: 65 };
    expect(worstFit(plan, target, ["protein", "carbs", "fat"])).toBe("warn");
  });

  it("ignores nutrients the user isn't tracking", () => {
    // Fat is wildly out, but the user only asked to see protein and carbs.
    const plan: Macros = { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 200 };
    expect(worstFit(plan, target, ["protein", "carbs"])).toBe("ok");
  });

  it("is ok when there is nothing to judge", () => {
    expect(worstFit({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, null, ["protein"])).toBe("ok");
  });
});
