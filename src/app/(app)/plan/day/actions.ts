"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isFoodAllowed } from "@/lib/ai";
import { planPantryDay, type DayPicks, type PantryFood } from "@/lib/mealplan";
import {
  getCurrentTargets,
  getProfile,
  getTodayConsumed,
  getTodayPlan,
  localToday,
} from "@/lib/queries";
import {
  sumItems,
  type DietType,
  type FoodChoice,
  type PlanItem,
  type Macros,
} from "@/lib/types";

function revalidate() {
  revalidatePath("/plan/day");
  revalidatePath("/dashboard");
}

// Every pantry item with its per-100g macros, filtered to what the diet allows
// (a vegan pantry shouldn't build a meal around meat someone else added). This
// is the whole input the local planner needs — no AI, no network.
async function pantryFoods(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  diet: DietType,
  allergies: string[],
  dislikes: string[],
): Promise<PantryFood[]> {
  const { data } = await supabase
    .from("pantry_items")
    .select("name, kcal_100g, protein_100g, carbs_100g, fat_100g, pack_size_g, quantity");
  return (
    (data as Array<{
      name: string;
      kcal_100g: number;
      protein_100g: number;
      carbs_100g: number;
      fat_100g: number;
      pack_size_g: number | null;
      quantity: number | null;
    }>) ?? []
  )
    // Only offer foods the user can actually eat — diet, allergies and dislikes
    // all excluded, so nothing they'd reject reaches the plan.
    .filter((p) => isFoodAllowed(p.name, diet, allergies, dislikes))
    .map((p) => {
      // How much is in stock: pack size × number of packs. Left undefined when
      // the item has no pack size, so the planner won't cap it.
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
}

// Look up foods to add to a meal — only the pantry the user already has. Planning
// the day is about eating down what's in stock, so the search never reaches the
// web; when nothing matches, the UI offers to add the item to the pantry first.
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
    .limit(10);

  return (
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

// Remove everything the app planned for today that the user hasn't eaten yet —
// for when they don't like the auto-plan and want to start over. Meals they
// built themselves (origin 'manual') and anything already logged are left
// untouched (deleting a logged meal would orphan its food-log entry).
export async function clearAppPlan() {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("planned_meals")
    .delete()
    .eq("user_id", user.id)
    .eq("date", localToday())
    .eq("origin", "ai")
    .is("logged_food_id", null);
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

// Undo "I ate this": drop the food-log entry and clear the mark so the slot
// goes back to being editable. The plan's foods are kept — the user is just
// correcting a meal they logged too soon.
export async function unlogPlannedMeal(id: string) {
  const { supabase, user } = await requireUser();

  const { data: meal } = await supabase
    .from("planned_meals")
    .select("logged_food_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!meal) throw new Error("Meal not found");
  const logId = (meal as { logged_food_id: string | null }).logged_food_id;
  if (!logId) return; // not logged — nothing to undo

  await supabase.from("food_logs").delete().eq("id", logId).eq("user_id", user.id);
  const { error } = await supabase
    .from("planned_meals")
    .update({ logged_food_id: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidate();
}

// Remove a planned meal outright, eaten or not. Its food-log entry (if it was
// eaten) goes too, so the day's totals drop back.
export async function removePlannedMeal(id: string) {
  const { supabase, user } = await requireUser();

  const { data: meal } = await supabase
    .from("planned_meals")
    .select("logged_food_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!meal) throw new Error("Meal not found");
  const logId = (meal as { logged_food_id: string | null }).logged_food_id;

  if (logId) {
    await supabase.from("food_logs").delete().eq("id", logId).eq("user_id", user.id);
  }
  const { error } = await supabase
    .from("planned_meals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidate();
}

// Fill every empty slot from the pantry so the day's totals hit target. Meals
// the user already built (manual) and already ate (logged) are left untouched;
// the AI just budgets around their macros.
export async function planMyDay(picks?: DayPicks) {
  const { supabase, user } = await requireUser();

  const [profile, targets, consumed, plan] = await Promise.all([
    getProfile(),
    getCurrentTargets(),
    getTodayConsumed(),
    getTodayPlan(),
  ]);
  if (!profile) throw new Error("Finish onboarding first");
  if (!targets) throw new Error("No macro target yet — finish onboarding.");
  const pantry = await pantryFoods(
    supabase,
    profile.diet_type,
    profile.allergies ?? [],
    profile.dislikes ?? [],
  );

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

  const meals = planPantryDay({ pantry, budget, fixed, emptySlots, picks });

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
