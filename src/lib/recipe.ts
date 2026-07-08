import type { ParsedRecipe } from "@/lib/ai";

// Read a recipe from a page's schema.org/Recipe JSON-LD (the structured data
// most recipe sites embed). Deterministic and keyless — we only fall back to
// the model when this returns null. Nutrition in schema.org is per serving, so
// we scale it up to whole-recipe totals to match ParsedRecipe.

type Json = Record<string, unknown>;

function firstNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const m = value.replace(",", ".").match(/[\d.]+/);
    if (m) return Number(m[0]);
  }
  return 0;
}

// recipeYield: "4", "4 servings", ["4 servings"], or a number.
function parseYield(value: unknown): number {
  if (Array.isArray(value)) return parseYield(value[0]);
  const n = Math.round(firstNumber(value));
  return n > 0 ? n : 1;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// Does this node's @type include "Recipe"?
function isRecipe(node: Json): boolean {
  const t = node["@type"];
  return asArray(t as string | string[]).some(
    (x) => typeof x === "string" && x.toLowerCase() === "recipe",
  );
}

// Walk a parsed JSON-LD blob (object, array, or { @graph: [...] }) for a Recipe.
function findRecipe(data: unknown): Json | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipe(item);
      if (found) return found;
    }
    return null;
  }
  if (data && typeof data === "object") {
    const obj = data as Json;
    if (isRecipe(obj)) return obj;
    if (obj["@graph"]) return findRecipe(obj["@graph"]);
  }
  return null;
}

function toRecipe(node: Json): ParsedRecipe | null {
  const name = typeof node.name === "string" ? node.name.trim() : "";
  const ingredients = asArray(node.recipeIngredient as string | string[])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => ({ name: s.trim(), quantity: "" }));

  if (!name || ingredients.length === 0) return null;

  const servings = parseYield(node.recipeYield);
  const nutrition = (node.nutrition as Json | undefined) ?? {};

  // schema.org nutrition is per serving → scale to whole-recipe totals.
  const perServingKcal = firstNumber(nutrition.calories);
  const kcal = perServingKcal * servings;

  return {
    name,
    servings,
    ingredients,
    kcal,
    protein_g: firstNumber(nutrition.proteinContent) * servings,
    carbs_g: firstNumber(nutrition.carbohydrateContent) * servings,
    fat_g: firstNumber(nutrition.fatContent) * servings,
  };
}

// Returns a recipe when the page has usable JSON-LD, else null. Requires at
// least a name + ingredients; nutrition may be absent (macros come back 0 and
// the caller can decide to fall back to the model for estimates).
export function extractRecipeJsonLd(html: string): ParsedRecipe | null {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const m of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const node = findRecipe(data);
    if (node) {
      const recipe = toRecipe(node);
      if (recipe) return recipe;
    }
  }
  return null;
}
