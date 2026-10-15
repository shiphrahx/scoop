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

// Log a number of servings to today's food, scaling the recipe's whole-batch
// macros down to per-serving × servings eaten.
export async function logRecipeServings(
  recipe: ParsedRecipe,
  servings: number,
) {
  const { supabase, user } = await requireUser();
  const perServing = Math.max(1, Math.round(recipe.servings));
  const factor = servings / perServing;

  const { error } = await supabase.from("food_logs").insert({
    user_id: user.id,
    name: recipe.name,
    source: "recipe",
    grams: null,
    kcal: Math.round(recipe.kcal * factor),
    protein_g: Math.round(recipe.protein_g * factor),
    carbs_g: Math.round(recipe.carbs_g * factor),
    fat_g: Math.round(recipe.fat_g * factor),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/plan/day");
}

export async function deleteRecipe(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/plan/recipe");
}
