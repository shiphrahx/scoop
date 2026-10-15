"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { logError } from "@/lib/log";
import {
  parseRecipeFromImage,
  parseRecipeFromUrl,
  type ParsedRecipe,
} from "@/lib/ai";
import type { ImageMediaType } from "@/lib/image";
import { localToday } from "@/lib/queries";
import { parseIngredientLine } from "@/lib/recipeingredients";
import type { FoodChoice, PlanItem } from "@/lib/types";
import {
  searchFoods,
  searchReference,
  searchWeb,
  setMealItems,
} from "../day/actions";

// What an import hands back. Errors come back as a value, not a throw: in a
// production build Next replaces a thrown server action's message with a
// generic "An error occurred in the Server Components render", so the reason
// the import failed never reached the screen.
export type RecipeImportResult =
  | { ok: true; recipe: ParsedRecipe }
  | { ok: false; message: string };

export async function importRecipeUrl(url: string): Promise<RecipeImportResult> {
  const { user } = await requireUser();
  // The URL importer makes an outbound fetch, throttle per user so it can't be
  // driven in a tight loop (as a scanner or to burn the AI key).
  if (!rateLimit(`recipe-url:${user.id}`, 10, 60_000)) {
    return { ok: false, message: "Too many imports. Give it a minute and try again." };
  }
  try {
    return { ok: true, recipe: await parseRecipeFromUrl(url) };
  } catch (e) {
    logError(`recipe import for user ${user.id} from ${url}`, e);
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Couldn't import that recipe.",
    };
  }
}

export async function importRecipeImage(
  base64: string,
  mediaType: ImageMediaType,
): Promise<ParsedRecipe> {
  await requireUser();
  return parseRecipeFromImage(base64, mediaType);
}

// Keep an imported recipe for later.
export async function saveRecipe(
  recipe: ParsedRecipe,
  sourceUrl: string | null,
) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("recipes").insert({
    user_id: user.id,
    name: recipe.name,
    source_url: sourceUrl,
    servings: Math.max(1, Math.round(recipe.servings)),
    ingredients: recipe.ingredients,
    kcal: recipe.kcal,
    protein_g: recipe.protein_g,
    carbs_g: recipe.carbs_g,
    fat_g: recipe.fat_g,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/plan/recipe");
}

// What adding a recipe to a meal hands back: which meal it went into, and the
// ingredient lines that couldn't be matched to a food, so the user knows what
// to add by hand.
export type AddRecipeResult =
  | { ok: true; slot: string; added: number; unmatched: string[] }
  | { ok: false; message: string };

// The best food for an ingredient line: the user's own pantry first (their
// actual eggs), then the reference foods, then Open Food Facts.
async function matchIngredient(term: string): Promise<FoodChoice | null> {
  if (term.length < 2) return null;
  const pantry = await searchFoods(term);
  if (pantry[0]) return pantry[0];
  const reference = await searchReference(term);
  if (reference[0]) return reference[0];
  const web = await searchWeb(term);
  return web[0] ?? null;
}

function choiceToItem(c: FoodChoice, grams: number): PlanItem {
  return {
    name: c.name,
    source: c.source,
    off_barcode: c.off_barcode,
    grams,
    kcal_100g: c.kcal_100g,
    protein_100g: c.protein_100g,
    carbs_100g: c.carbs_100g,
    fat_100g: c.fat_100g,
    fiber_100g: c.fiber_100g,
    sugar_100g: c.sugar_100g,
    satfat_100g: c.satfat_100g,
    sodium_mg_100g: c.sodium_mg_100g,
    unit_g: c.unit_g ?? null,
    unit_label: c.unit_label ?? null,
    unit_options: c.unit_options ?? null,
  };
}

// Put a recipe into one of the day's meals as its ingredients, each a food the
// user can adjust like any other in the meal builder. Logging it as a single
// line skipped the meal slots entirely, and left no way to make the omelette
// with two eggs instead of three. Amounts are scaled from the recipe's yield to
// the servings eaten. Today only: the recipe screen has no date picker.
export async function addRecipeToMeal(
  recipe: ParsedRecipe,
  servings: number,
  slot: string,
): Promise<AddRecipeResult> {
  const { supabase, user } = await requireUser();
  const day = await localToday();
  const factor = Math.max(0, servings) / Math.max(1, Math.round(recipe.servings));

  const { data: existingRow } = await supabase
    .from("planned_meals")
    .select("origin, items, logged_food_id")
    .eq("user_id", user.id)
    .eq("date", day)
    .eq("slot", slot)
    .maybeSingle();
  const existing = existingRow as {
    origin: string;
    items: PlanItem[] | null;
    logged_food_id: string | null;
  } | null;
  // Never write over a meal already eaten, or one the app planned: the user
  // would lose it without being asked.
  if (existing?.logged_food_id) {
    return { ok: false, message: `${slot} is already eaten. Pick another meal.` };
  }
  if (existing && existing.origin !== "manual") {
    return {
      ok: false,
      message: `${slot} has a meal planned. Clear it on the day plan first, or pick another meal.`,
    };
  }

  const items: PlanItem[] = [];
  const unmatched: string[] = [];
  for (const ing of recipe.ingredients) {
    const text = [ing.quantity, ing.name].filter(Boolean).join(" ").trim();
    const line = parseIngredientLine(text);
    if (line.skip) continue;
    const food = await matchIngredient(line.term);
    const whole =
      line.grams ?? (line.count != null && food?.unit_g ? line.count * food.unit_g : null);
    if (!food || whole == null || whole <= 0) {
      unmatched.push(text);
      continue;
    }
    items.push(choiceToItem(food, Math.max(1, Math.round(whole * factor))));
  }

  if (items.length === 0) {
    return {
      ok: false,
      message:
        "None of the ingredients matched a food. Build the meal on the day plan instead.",
    };
  }

  await setMealItems(slot, [...(existing?.items ?? []), ...items], day);
  return { ok: true, slot, added: items.length, unmatched };
}

export async function deleteRecipe(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/plan/recipe");
}
