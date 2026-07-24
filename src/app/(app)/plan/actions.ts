"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { violatesDiet } from "@/lib/ai";
import { suggestPantryMeals, type PantryFood } from "@/lib/mealplan";
import {
  MAX_ABV_PCT,
  MAX_VOLUME_ML,
  drinkMacros,
  type AlcoholAllocation,
} from "@/lib/alcohol";
import { getCurrentTargets, getProfile, getTimezone, getTodayConsumed, localToday } from "@/lib/queries";
import { dayRangeFor } from "@/lib/time";
import type { MealSuggestion } from "@/lib/types";

// Ask the AI for dishes the user can make from their pantry that fit their
// diet and the macros they have left today, optionally built around a chosen
// carb + protein.
export async function getSuggestions(
  carb?: string | null,
  protein?: string | null,
): Promise<MealSuggestion[]> {
  const { supabase } = await requireUser();

  const [profile, targets, consumed, { data: pantryData }] = await Promise.all([
    getProfile(),
    getCurrentTargets(),
    getTodayConsumed(),
    supabase
      .from("pantry_items")
      .select(
        "name, kcal_100g, protein_100g, carbs_100g, fat_100g, pack_size_g, quantity",
      ),
  ]);
  if (!profile) throw new Error("Finish onboarding first");

  const pantry: PantryFood[] = (
    (pantryData as Array<{
      name: string;
      kcal_100g: number;
      protein_100g: number;
      carbs_100g: number;
      fat_100g: number;
      pack_size_g: number | null;
      quantity: number | null;
    }>) ?? []
  )
    .filter((p) => !violatesDiet(p.name, profile.diet_type))
    .map((p) => {
      // Stock caps a portion at what the user actually has — a pack the app
      // can't exceed. Pack size × packs; left undefined (no cap) when unknown.
      const pack = p.pack_size_g != null ? Number(p.pack_size_g) : null;
      const qty = p.quantity != null ? Math.max(1, Number(p.quantity)) : 1;
      return {
        name: p.name,
        kcal_100g: Number(p.kcal_100g),
        protein_100g: Number(p.protein_100g),
        carbs_100g: Number(p.carbs_100g),
        fat_100g: Number(p.fat_100g),
        available_g: pack != null ? pack * qty : undefined,
      };
    });

  const remaining = targets
    ? {
        kcal: Math.max(0, Math.round(targets.kcal - consumed.kcal)),
        protein_g: Math.max(0, Math.round(targets.protein_g - consumed.protein_g)),
        carbs_g: Math.max(0, Math.round(targets.carbs_g - consumed.carbs_g)),
        fat_g: Math.max(0, Math.round(targets.fat_g - consumed.fat_g)),
      }
    : { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

  return suggestPantryMeals({
    pantry,
    remaining,
    carb: carb ?? null,
    protein: protein ?? null,
  });
}

// A drink the user logged: a preset or a custom volume + ABV, plus how to book
// the alcohol calories and any real mixer carbs / cream-liqueur fat.
export interface AlcoholInput {
  name: string;
  volumeMl: number;
  abvPct: number;
  allocation: AlcoholAllocation;
  extraCarbsG?: number;
  extraFatG?: number;
  // The day to log against; defaults to today. Non-today logs at that day's
  // local midnight so they land in the right day's totals.
  date?: string;
}

// Log an alcoholic drink. The alcohol calories are booked onto carbs or fat (the
// user's choice), real drink carbs/fat are added on top, and the day's calories
// stay correct. The choice is remembered as the user's default next time.
export async function logAlcohol(input: AlcoholInput) {
  const { supabase, user } = await requireUser();

  const volumeMl = Number(input.volumeMl);
  const abvPct = Number(input.abvPct);
  if (!(volumeMl > 0) || !(abvPct > 0)) {
    throw new Error("Enter a volume and an ABV above zero.");
  }
  if (volumeMl > MAX_VOLUME_ML || abvPct > MAX_ABV_PCT) {
    throw new Error("That looks too big — check the volume and ABV.");
  }
  if (!["carbs", "fat", "split"].includes(input.allocation)) {
    throw new Error("Choose whether to count the alcohol as carbs or fat.");
  }

  const m = drinkMacros({
    volumeMl,
    abvPct,
    allocation: input.allocation,
    extraCarbsG: Number(input.extraCarbsG ?? 0),
    extraFatG: Number(input.extraFatG ?? 0),
  });
  // A single drink over ~2000 kcal is almost certainly a typo, not a pour.
  if (m.kcal > 2000) {
    throw new Error("That's a lot for one drink — check the numbers.");
  }

  const today = await localToday();
  const day = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : today;
  const loggedAt =
    day === today ? undefined : dayRangeFor(await getTimezone(), day).start.toISOString();

  const { error } = await supabase.from("food_logs").insert({
    user_id: user.id,
    name: input.name.trim() || "Alcoholic drink",
    source: "alcohol",
    grams: null,
    ...(loggedAt ? { logged_at: loggedAt } : {}),
    kcal: Math.round(m.kcal),
    protein_g: Math.round(m.protein_g),
    carbs_g: Math.round(m.carbs_g),
    fat_g: Math.round(m.fat_g),
    fiber_g: Math.round(m.fiber_g),
    sugar_g: Math.round(m.sugar_g),
    satfat_g: Math.round(m.satfat_g),
    sodium_mg: Math.round(m.sodium_mg),
    alcohol_g: Math.round(m.alcohol_g * 10) / 10,
    alcohol_allocation: input.allocation,
  });
  if (error) throw new Error(error.message);

  // Remember the booking so the logger defaults to it next time.
  await supabase
    .from("users")
    .update({ last_alcohol_allocation: input.allocation, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/plan/day");
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
  revalidatePath("/plan/day");
}
