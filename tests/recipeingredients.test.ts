import { describe, expect, it } from "vitest";
import { parseIngredientLine } from "@/lib/recipeingredients";

// Lines copied from real recipe pages: the BBC Good Food omelette and the
// Waitrose noodle omelette from issue #79 and #78, plus the usual oddities.

describe("parseIngredientLine", () => {
  it("reads a bare count as a count, prep note dropped", () => {
    expect(parseIngredientLine("3 eggs beaten")).toEqual({
      term: "eggs",
      grams: null,
      count: 3,
      skip: false,
    });
    expect(parseIngredientLine("3 eggs, beaten").term).toBe("eggs");
  });

  it("reads a spoon as grams", () => {
    expect(parseIngredientLine("1 tsp sunflower oil")).toMatchObject({
      term: "sunflower oil",
      grams: 5,
    });
    expect(parseIngredientLine("2 tbsp olive oil")).toMatchObject({
      term: "olive oil",
      grams: 30,
    });
    expect(parseIngredientLine("1 tsp butter")).toMatchObject({ term: "butter", grams: 5 });
  });

  it("drops the container a weight is quoted on", () => {
    expect(parseIngredientLine("275 g pack rice noodles")).toMatchObject({
      term: "rice noodles",
      grams: 275,
    });
    expect(parseIngredientLine("200g jar chilli & garlic sauce")).toMatchObject({
      term: "chilli & garlic sauce",
      grams: 200,
    });
  });

  it("reads the weight out of a parenthetical", () => {
    expect(parseIngredientLine("1 tin (400g) chopped tomatoes")).toMatchObject({
      term: "tomatoes",
      grams: 400,
    });
  });

  it("multiplies a count of weighed containers", () => {
    expect(parseIngredientLine("2 x 400g tins chickpeas")).toMatchObject({
      term: "chickpeas",
      grams: 800,
    });
  });

  it("reads fractions", () => {
    expect(parseIngredientLine("½ tsp chilli flakes").grams).toBe(3);
    expect(parseIngredientLine("1/2 onion")).toMatchObject({ term: "onion", count: 0.5 });
    expect(parseIngredientLine("1½ tbsp honey").grams).toBe(23);
  });

  it("skips seasoning and water", () => {
    expect(parseIngredientLine("salt and pepper").skip).toBe(true);
    expect(parseIngredientLine("Freshly ground black pepper").skip).toBe(true);
    expect(parseIngredientLine("a pinch of salt").skip).toBe(true);
    expect(parseIngredientLine("2 tbsp cold water").skip).toBe(true);
    expect(parseIngredientLine("salted butter").skip).toBe(false);
  });

  it("leaves an unquantified food with neither amount", () => {
    expect(parseIngredientLine("a little coriander")).toMatchObject({
      grams: null,
      count: null,
    });
  });
});
