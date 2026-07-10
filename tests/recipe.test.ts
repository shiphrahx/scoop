import { describe, expect, it } from "vitest";
import { extractRecipeJsonLd } from "@/lib/recipe";

// Wrap a JSON-LD object in the <script> tag the extractor scans for.
function page(jsonLd: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(
    jsonLd,
  )}</script></head><body>...</body></html>`;
}

const RECIPE = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Dhal",
  recipeYield: "4 servings",
  recipeIngredient: ["200 g red lentils", "1 onion"],
  nutrition: {
    "@type": "NutritionInformation",
    calories: "250 kcal",
    proteinContent: "12 g",
    carbohydrateContent: "40 g",
    fatContent: "5 g",
  },
};

describe("extractRecipeJsonLd", () => {
  it("returns null when there is no JSON-LD", () => {
    expect(extractRecipeJsonLd("<html><body>no data</body></html>")).toBeNull();
  });

  it("reads name, servings and ingredients", () => {
    const r = extractRecipeJsonLd(page(RECIPE))!;
    expect(r).not.toBeNull();
    expect(r.name).toBe("Dhal");
    expect(r.servings).toBe(4);
    expect(r.ingredients.map((i) => i.name)).toEqual([
      "200 g red lentils",
      "1 onion",
    ]);
  });

  it("scales per-serving nutrition up to whole-recipe totals", () => {
    const r = extractRecipeJsonLd(page(RECIPE))!;
    // 250 kcal/serving * 4 servings
    expect(r.kcal).toBe(1000);
    expect(r.protein_g).toBe(48);
    expect(r.carbs_g).toBe(160);
    expect(r.fat_g).toBe(20);
  });

  it("finds a Recipe nested inside an @graph", () => {
    const r = extractRecipeJsonLd(
      page({ "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, RECIPE] }),
    )!;
    expect(r.name).toBe("Dhal");
  });

  it("finds a Recipe inside a top-level array", () => {
    const r = extractRecipeJsonLd(page([{ "@type": "Organization" }, RECIPE]))!;
    expect(r.name).toBe("Dhal");
  });

  it("matches @type case-insensitively and as an array", () => {
    const r = extractRecipeJsonLd(
      page({ ...RECIPE, "@type": ["Thing", "recipe"] }),
    )!;
    expect(r.name).toBe("Dhal");
  });

  it("defaults servings to 1 when recipeYield is missing", () => {
    const { recipeYield, ...noYield } = RECIPE;
    void recipeYield;
    const r = extractRecipeJsonLd(page(noYield))!;
    expect(r.servings).toBe(1);
    expect(r.kcal).toBe(250); // 250 * 1
  });

  it("returns 0 macros when nutrition is absent", () => {
    const { nutrition, ...noNutrition } = RECIPE;
    void nutrition;
    const r = extractRecipeJsonLd(page(noNutrition))!;
    expect(r.kcal).toBe(0);
    expect(r.protein_g).toBe(0);
  });

  it("returns null when the node has no ingredients", () => {
    const { recipeIngredient, ...noIng } = RECIPE;
    void recipeIngredient;
    expect(extractRecipeJsonLd(page(noIng))).toBeNull();
  });

  it("skips malformed JSON and keeps scanning later scripts", () => {
    const html =
      `<script type="application/ld+json">{ broken json </script>` +
      page(RECIPE);
    const r = extractRecipeJsonLd(html)!;
    expect(r.name).toBe("Dhal");
  });

  it("parses a comma decimal in nutrition values", () => {
    const r = extractRecipeJsonLd(
      page({ ...RECIPE, recipeYield: 1, nutrition: { calories: "12,5 kcal" } }),
    )!;
    expect(r.kcal).toBeCloseTo(12.5, 5);
  });
});
