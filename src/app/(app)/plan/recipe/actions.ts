"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import {
  parseRecipeFromImage,
  parseRecipeFromUrl,
  type ParsedRecipe,
} from "@/lib/ai";
import type { ImageMediaType } from "@/lib/image";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

export async function importRecipeUrl(url: string): Promise<ParsedRecipe> {
  const { user } = await requireUser();
  // The URL importer makes an outbound fetch — throttle per user so it can't be
  // driven in a tight loop (as a scanner or to burn the AI key).
  if (!rateLimit(`recipe-url:${user.id}`, 10, 60_000)) {
    throw new Error("Too many imports — give it a minute and try again.");
  }
  return parseRecipeFromUrl(url);
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
