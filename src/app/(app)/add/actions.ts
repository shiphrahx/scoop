"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FoodSource } from "@/lib/types";

export interface LogFoodInput {
  name: string;
  grams: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  satfat_g?: number;
  sodium_mg?: number;
  source?: FoodSource;
}

export async function logFood(input: LogFoodInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("food_logs").insert({
    user_id: user.id,
    name: input.name,
    source: input.source ?? "manual",
    grams: input.grams,
    kcal: input.kcal,
    protein_g: input.protein_g,
    carbs_g: input.carbs_g,
    fat_g: input.fat_g,
    fiber_g: input.fiber_g ?? 0,
    sugar_g: input.sugar_g ?? 0,
    satfat_g: input.satfat_g ?? 0,
    sodium_mg: input.sodium_mg ?? 0,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/add");
  revalidatePath("/");
}

export async function deleteFood(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("food_logs").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/add");
  revalidatePath("/");
}

// --- Favourites ("my usual") ------------------------------------------------

export interface FavouriteInput {
  name: string;
  grams: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export async function saveFavourite(input: FavouriteInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("favourites").insert({
    user_id: user.id,
    name: input.name,
    grams: input.grams,
    kcal: input.kcal,
    protein_g: input.protein_g,
    carbs_g: input.carbs_g,
    fat_g: input.fat_g,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/add");
}

// Log a favourite straight to today's food — the one-tap "my usual".
export async function logFavourite(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: fav, error: readError } = await supabase
    .from("favourites")
    .select("name, grams, kcal, protein_g, carbs_g, fat_g")
    .eq("id", id)
    .single();
  if (readError) throw new Error(readError.message);

  const { error } = await supabase.from("food_logs").insert({
    user_id: user.id,
    name: fav.name,
    source: "manual",
    grams: fav.grams,
    kcal: fav.kcal,
    protein_g: fav.protein_g,
    carbs_g: fav.carbs_g,
    fat_g: fav.fat_g,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/add");
  revalidatePath("/");
}

export async function deleteFavourite(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("favourites").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/add");
}
