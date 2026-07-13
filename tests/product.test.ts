import { describe, expect, it } from "vitest";
import {
  extractNutritionTable,
  extractProductJsonLd,
  extractProductName,
} from "@/lib/product";

describe("extractNutritionTable", () => {
  it("reads a UK per-100g table, taking kcal and the first (per-100g) column", () => {
    const html = `
      <table>
        <tr><th></th><th>Per 100g</th><th>Per serving (30g)</th></tr>
        <tr><td>Energy</td><td>1046kJ / 250kcal</td><td>314kJ / 75kcal</td></tr>
        <tr><td>Fat</td><td>12g</td><td>3.6g</td></tr>
        <tr><td>of which saturates</td><td>2.5g</td><td>0.8g</td></tr>
        <tr><td>Carbohydrate</td><td>30g</td><td>9g</td></tr>
        <tr><td>of which sugars</td><td>5g</td><td>1.5g</td></tr>
        <tr><td>Fibre</td><td>3g</td><td>0.9g</td></tr>
        <tr><td>Protein</td><td>8g</td><td>2.4g</td></tr>
        <tr><td>Salt</td><td>0.5g</td><td>0.15g</td></tr>
      </table>`;
    expect(extractNutritionTable(html)).toEqual({
      kcal_100g: 250,
      protein_100g: 8,
      carbs_100g: 30,
      fat_100g: 12,
      fiber_100g: 3,
      sugar_100g: 5,
      satfat_100g: 2.5,
      // salt 0.5 g → sodium 0.5 / 2.5 × 1000 = 200 mg
      sodium_mg_100g: 200,
    });
  });

  it("handles 'Saturated fat' wording and EU decimal commas", () => {
    const html =
      "Energy 900 kJ 215 kcal Fat 10,5 g Saturated fat 1,2 g " +
      "Carbohydrate 25 g Sugars 3 g Protein 6 g Salt 0,3 g";
    const t = extractNutritionTable(html)!;
    expect(t.kcal_100g).toBe(215);
    expect(t.fat_100g).toBe(10.5);
    expect(t.satfat_100g).toBe(1.2);
    expect(t.protein_100g).toBe(6);
  });

  it("returns null without a kcal figure", () => {
    expect(extractNutritionTable("<p>Delicious biscuits, buy now</p>")).toBeNull();
  });

  it("returns null when no core macro is present (kcal alone is noise)", () => {
    expect(extractNutritionTable("Burns 250 kcal on the treadmill")).toBeNull();
  });
});

describe("extractProductJsonLd", () => {
  it("pulls name, GTIN, gram pack size, and per-serving nutrition normalised to 100g", () => {
    const ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Crunchy Peanut Butter",
      gtin13: "5000432123456",
      weight: { "@type": "QuantitativeValue", value: "1", unitCode: "KGM" },
      nutrition: {
        "@type": "NutritionInformation",
        servingSize: "50 g",
        calories: "300 kcal",
        proteinContent: "12.5 g",
        carbohydrateContent: "5 g",
        fatContent: "25 g",
      },
    };
    const html = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
    const out = extractProductJsonLd(html)!;
    expect(out.name).toBe("Crunchy Peanut Butter");
    expect(out.gtin).toBe("5000432123456");
    expect(out.packSizeG).toBe(1000);
    // 50 g serving → ×2 to reach per 100 g.
    expect(out.nutrition).toMatchObject({
      kcal_100g: 600,
      protein_100g: 25,
      carbs_100g: 10,
      fat_100g: 50,
    });
  });

  it("finds a Product inside an @graph and skips nutrition without a gram serving size", () => {
    const ld = {
      "@graph": [
        { "@type": "BreadcrumbList" },
        {
          "@type": "Product",
          name: "Oat Milk",
          gtin: "5001234567890",
          nutrition: { "@type": "NutritionInformation", calories: "45 kcal" },
        },
      ],
    };
    const html = `<script type='application/ld+json'>${JSON.stringify(ld)}</script>`;
    const out = extractProductJsonLd(html)!;
    expect(out.name).toBe("Oat Milk");
    expect(out.gtin).toBe("5001234567890");
    expect(out.nutrition).toBeNull(); // no servingSize → can't normalise
  });

  it("returns null when there is no Product node", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "WebPage",
    })}</script>`;
    expect(extractProductJsonLd(html)).toBeNull();
  });
});

describe("extractProductName", () => {
  it("prefers og:title and decodes entities", () => {
    const html = `<meta property="og:title" content="Sainsbury&#39;s Houmous &amp; Pitta"><title>x</title>`;
    expect(extractProductName(html)).toBe("Sainsbury's Houmous & Pitta");
  });

  it("falls back to <title>, then <h1>", () => {
    expect(extractProductName("<title>  Greek  Yogurt  </title>")).toBe(
      "Greek Yogurt",
    );
    expect(extractProductName("<h1>Baked <span>Beans</span></h1>")).toBe(
      "Baked Beans",
    );
  });
});
