"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { suggestMeals } from "@/lib/ai";
import { getCurrentTargets, getProfile, getTodayConsumed } from "@/lib/queries";
import type { MealSuggestion } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

// Ask the AI for dishes the user can make from their pantry that fit their
// diet and the macros they have left today.
export async function getSuggestions(): Promise<MealSuggestion[]> {
  const { supabase } = await requireUser();

  const [profile, targets, consumed, { data: pantryData }] = await Promise.all([
    getProfile(),
    getCurrentTargets(),
    getTodayConsumed(),
    supabase.from("pantry_items").select("name"),
  ]);
  if (!profile) throw new Error("Finish onboarding first");

  const pantry = ((pantryData as { name: string }[]) ?? []).map((p) => p.name);

  const remaining = targets
    ? {
        kcal: Math.max(0, Math.round(targets.kcal - consumed.kcal)),
        protein_g: Math.max(0, Math.round(targets.protein_g - consumed.protein_g)),
        carbs_g: Math.max(0, Math.round(targets.carbs_g - consumed.carbs_g)),
        fat_g: Math.max(0, Math.round(targets.fat_g - consumed.fat_g)),
      }
    : { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

  return suggestMeals({
    diet: profile.diet_type,
    allergies: profile.allergies,
    dislikes: profile.dislikes,
    pantry,
    remaining,
  });
}

// Log a suggested dish to today's food.
export async function logSuggestion(meal: MealSuggestion) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("food_logs").insert({
    user_id: user.id,
    name: meal.name,
    source: "manual",
    grams: null,
    kcal: meal.kcal,
    protein_g: meal.protein_g,
    carbs_g: meal.carbs_g,
    fat_g: meal.fat_g,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/add");
}
