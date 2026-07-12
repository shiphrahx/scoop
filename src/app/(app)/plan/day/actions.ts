"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { planDay, suggestMeals, estimateMeals, type KnownMeal } from "@/lib/ai";
import { searchProducts } from "@/lib/off";
import {
  getCurrentTargets,
  getProfile,
  getTodayConsumed,
  getTodayPlan,
  localToday,
} from "@/lib/queries";
import {
  sumItems,
  type FoodChoice,
  type MealSuggestion,
  type PlanItem,
  type Macros,
} from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

function revalidate() {
  revalidatePath("/plan/day");
  revalidatePath("/dashboard");
  revalidatePath("/add");
}

// Look up foods to add to a meal. Pantry items the user already has come first
// (they're what we most want them eating); Open Food Facts fills the rest so
// they can add anything. Deduped so a pantry item isn't repeated from the web.
export async function searchFoods(query: string): Promise<FoodChoice[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { supabase } = await requireUser();

  const { data: pantryData } = await supabase
    .from("pantry_items")
    .select(
      "name, off_barcode, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, satfat_100g, sodium_mg_100g, pack_size_g",
    )
    .ilike("name", `%${q}%`)
    .limit(6);

  const pantry: FoodChoice[] = (
    (pantryData as Array<{
      name: string;
      off_barcode: string | null;
      kcal_100g: number;
      protein_100g: number;
      carbs_100g: number;
      fat_100g: number;
      fiber_100g: number;
      sugar_100g: number;
      satfat_100g: number;
      sodium_mg_100g: number;
      pack_size_g: number | null;
    }>) ?? []
  ).map((p) => ({
    name: p.name,
    source: "pantry",
    off_barcode: p.off_barcode,
    brand: null,
    kcal_100g: Number(p.kcal_100g),
    protein_100g: Number(p.protein_100g),
    carbs_100g: Number(p.carbs_100g),
    fat_100g: Number(p.fat_100g),
    fiber_100g: Number(p.fiber_100g ?? 0),
    sugar_100g: Number(p.sugar_100g ?? 0),
    satfat_100g: Number(p.satfat_100g ?? 0),
    sodium_mg_100g: Number(p.sodium_mg_100g ?? 0),
    pack_size_g: p.pack_size_g != null ? Number(p.pack_size_g) : null,
  }));

  // Only reach out to the web if the pantry didn't clearly cover the query.
  let web: FoodChoice[] = [];
  if (pantry.length < 5) {
    const seen = new Set(pantry.map((p) => p.name.toLowerCase()));
    web = (await searchProducts(q, 6))
      .filter((c) => !seen.has(c.name.toLowerCase()))
      .map((c) => ({
        name: c.name,
        source: "off",
        off_barcode: c.code,
        brand: c.brand,
        kcal_100g: c.kcal_100g,
        protein_100g: c.protein_100g,
        carbs_100g: c.carbs_100g,
        fat_100g: c.fat_100g,
        fiber_100g: c.fiber_100g,
        sugar_100g: c.sugar_100g,
        satfat_100g: c.satfat_100g,
        sodium_mg_100g: c.sodium_mg_100g,
        pack_size_g: c.pack_size_g,
      }));
  }

  return [...pantry, ...web].slice(0, 10);
}

// Save the list of foods the user picked for a slot. Empty list clears the
// slot. Macros are the exact sum of the items — no AI estimate needed.
export async function setMealItems(slot: string, items: PlanItem[]) {
  const { supabase, user } = await requireUser();

  if (items.length === 0) {
    await supabase
      .from("planned_meals")
      .delete()
      .eq("user_id", user.id)
      .eq("date", localToday())
      .eq("slot", slot);
    revalidate();
    return;
  }

  const profile = await getProfile();
  const position = Math.max(0, (profile?.meal_slots ?? []).indexOf(slot));
  const totals = sumItems(items);
  const name = items.map((i) => i.name).join(", ");

  const { error } = await supabase.from("planned_meals").upsert(
    {
      user_id: user.id,
      date: localToday(),
      slot,
      position,
      origin: "manual",
      name,
      items,
      portions: [],
      swaps: [],
      why: null,
      kcal: totals.kcal,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
      fiber_g: totals.fiber_g,
      sugar_g: totals.sugar_g,
      satfat_g: totals.satfat_g,
      sodium_mg: totals.sodium_mg,
      logged_food_id: null,
    },
    { onConflict: "user_id,date,slot" },
  );
  if (error) throw new Error(error.message);
  revalidate();
}

// Empty a slot again.
export async function clearSlot(slot: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("planned_meals")
    .delete()
    .eq("user_id", user.id)
    .eq("date", localToday())
    .eq("slot", slot);
  if (error) throw new Error(error.message);
  revalidate();
}

// Fill every empty slot from the pantry so the day's totals hit target. Meals
// the user already built (manual) and already ate (logged) are left untouched;
// the AI just budgets around their macros.
export async function planMyDay() {
  const { supabase, user } = await requireUser();

  const [profile, targets, consumed, plan, { data: pantryData }] =
    await Promise.all([
      getProfile(),
      getCurrentTargets(),
      getTodayConsumed(),
      getTodayPlan(),
      supabase.from("pantry_items").select("name"),
    ]);
  if (!profile) throw new Error("Finish onboarding first");
  if (!targets) throw new Error("No macro target yet — finish onboarding.");

  const slotNames = profile.meal_slots ?? [];
  const bySlot = new Map(plan.map((p) => [p.slot, p]));

  const emptySlots = slotNames.filter((s) => !bySlot.get(s));
  if (emptySlots.length === 0) {
    revalidate();
    return;
  }

  // Macros of meals the user built but hasn't eaten yet — fixed, budget around.
  const fixed: Macros = plan
    .filter((p) => !p.logged_food_id)
    .reduce<Macros>(
      (s, p) => ({
        kcal: s.kcal + p.kcal,
        protein_g: s.protein_g + p.protein_g,
        carbs_g: s.carbs_g + p.carbs_g,
        fat_g: s.fat_g + p.fat_g,
      }),
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );

  const budget: Macros = {
    kcal: Math.max(0, Math.round(targets.kcal - consumed.kcal)),
    protein_g: Math.max(0, Math.round(targets.protein_g - consumed.protein_g)),
    carbs_g: Math.max(0, Math.round(targets.carbs_g - consumed.carbs_g)),
    fat_g: Math.max(0, Math.round(targets.fat_g - consumed.fat_g)),
  };

  const meals = await planDay({
    diet: profile.diet_type,
    allergies: profile.allergies,
    dislikes: profile.dislikes,
    pantry: ((pantryData as { name: string }[]) ?? []).map((p) => p.name),
    budget,
    fixed,
    emptySlots,
  });

  const bySlotResult = new Map(meals.map((m) => [m.slot, m]));
  const rows = emptySlots
    .map((slot, i) => {
      // Match by slot name; fall back to positional if the model didn't echo it.
      const m = bySlotResult.get(slot) ?? meals[i];
      if (!m) return null;
      return {
        user_id: user.id,
        date: localToday(),
        slot,
        position: Math.max(0, slotNames.indexOf(slot)),
        origin: "ai",
        name: m.name,
        items: [],
        portions: m.portions,
        swaps: m.swaps,
        why: m.why,
        kcal: m.kcal,
        protein_g: m.protein_g,
        carbs_g: m.carbs_g,
        fat_g: m.fat_g,
        // AI dishes don't carry the extra nutrients — leave them at 0.
        fiber_g: 0,
        sugar_g: 0,
        satfat_g: 0,
        sodium_mg: 0,
        logged_food_id: null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length) {
    const { error } = await supabase
      .from("planned_meals")
      .upsert(rows, { onConflict: "user_id,date,slot" });
    if (error) throw new Error(error.message);
  }
  revalidate();
}

// --- "I know what I want" guided wizard -------------------------------------

// Macros still to eat today = target minus what's already been logged minus the
// meals the user has planned but not yet eaten. What the wizard should fill.
async function remainingToday(): Promise<Macros> {
  const [targets, consumed, plan] = await Promise.all([
    getCurrentTargets(),
    getTodayConsumed(),
    getTodayPlan(),
  ]);
  const zero = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  if (!targets) return zero;
  const planned = plan
    .filter((p) => !p.logged_food_id)
    .reduce<Macros>(
      (s, p) => ({
        kcal: s.kcal + p.kcal,
        protein_g: s.protein_g + p.protein_g,
        carbs_g: s.carbs_g + p.carbs_g,
        fat_g: s.fat_g + p.fat_g,
      }),
      zero,
    );
  return {
    kcal: Math.max(0, Math.round(targets.kcal - consumed.kcal - planned.kcal)),
    protein_g: Math.max(0, Math.round(targets.protein_g - consumed.protein_g - planned.protein_g)),
    carbs_g: Math.max(0, Math.round(targets.carbs_g - consumed.carbs_g - planned.carbs_g)),
    fat_g: Math.max(0, Math.round(targets.fat_g - consumed.fat_g - planned.fat_g)),
  };
}

// Save the meals the user typed in words: estimate each one's macros (AI) and
// fix them into their slots as manual meals, so the rest of the day budgets
// around them. Returns how many were saved.
export async function saveKnownMeals(entries: KnownMeal[]): Promise<number> {
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  if (!profile) throw new Error("Finish onboarding first");

  const estimates = await estimateMeals(entries, profile.diet_type);
  if (estimates.length === 0) return 0;

  const slotNames = profile.meal_slots ?? [];
  const rows = estimates.map((m) => ({
    user_id: user.id,
    date: localToday(),
    slot: m.slot,
    position: Math.max(0, slotNames.indexOf(m.slot)),
    origin: "manual",
    name: m.name,
    items: [],
    portions: [],
    swaps: [],
    why: null,
    kcal: m.kcal,
    protein_g: m.protein_g,
    carbs_g: m.carbs_g,
    fat_g: m.fat_g,
    fiber_g: 0,
    sugar_g: 0,
    satfat_g: 0,
    sodium_mg: 0,
    logged_food_id: null,
  }));

  const { error } = await supabase
    .from("planned_meals")
    .upsert(rows, { onConflict: "user_id,date,slot" });
  if (error) throw new Error(error.message);
  revalidate();
  return rows.length;
}

// Suggest dishes built around a chosen carb + protein from the pantry, sized to
// what's left of today after the meals the user has already decided.
export async function suggestAround(
  carb: string | null,
  protein: string | null,
): Promise<MealSuggestion[]> {
  const { supabase } = await requireUser();
  const [profile, remaining, { data: pantryData }] = await Promise.all([
    getProfile(),
    remainingToday(),
    supabase.from("pantry_items").select("name"),
  ]);
  if (!profile) throw new Error("Finish onboarding first");

  return suggestMeals({
    diet: profile.diet_type,
    allergies: profile.allergies,
    dislikes: profile.dislikes,
    pantry: ((pantryData as { name: string }[]) ?? []).map((p) => p.name),
    remaining,
    carb,
    protein,
  });
}

// Drop a suggested dish into a slot as an AI-origin planned meal.
export async function assignSuggestion(slot: string, meal: MealSuggestion) {
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  const position = Math.max(0, (profile?.meal_slots ?? []).indexOf(slot));

  const { error } = await supabase.from("planned_meals").upsert(
    {
      user_id: user.id,
      date: localToday(),
      slot,
      position,
      origin: "ai",
      name: meal.name,
      items: [],
      portions: meal.portions,
      swaps: meal.swaps,
      why: meal.why,
      kcal: meal.kcal,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fat_g: meal.fat_g,
      fiber_g: 0,
      sugar_g: 0,
      satfat_g: 0,
      sodium_mg: 0,
      logged_food_id: null,
    },
    { onConflict: "user_id,date,slot" },
  );
  if (error) throw new Error(error.message);
  revalidate();
}

// Log a planned meal to today's food and mark the slot done.
export async function logPlannedMeal(id: string) {
  const { supabase, user } = await requireUser();

  const { data: meal } = await supabase
    .from("planned_meals")
    .select(
      "name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg, logged_food_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!meal) throw new Error("Meal not found");
  const m = meal as {
    name: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    satfat_g: number;
    sodium_mg: number;
    logged_food_id: string | null;
  };
  if (m.logged_food_id) return; // already eaten

  const { data: log, error } = await supabase
    .from("food_logs")
    .insert({
      user_id: user.id,
      name: m.name,
      source: "manual",
      grams: null,
      kcal: m.kcal,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      fiber_g: m.fiber_g,
      sugar_g: m.sugar_g,
      satfat_g: m.satfat_g,
      sodium_mg: m.sodium_mg,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase
    .from("planned_meals")
    .update({ logged_food_id: (log as { id: string }).id })
    .eq("id", id);

  revalidate();
}
