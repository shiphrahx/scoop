"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { planDay } from "@/lib/ai";
import {
  getCurrentTargets,
  getProfile,
  getTodayConsumed,
  getTodayPlan,
  localToday,
} from "@/lib/queries";

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

// Pin a meal the user already knows they'll eat, as free text. Macros stay 0
// until they plan the day (the AI estimates them then). Slot position comes
// from the user's configured order.
export async function pinMeal(slot: string, text: string) {
  const name = text.trim();
  if (!name) return;
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  const position = Math.max(0, (profile?.meal_slots ?? []).indexOf(slot));

  const { error } = await supabase.from("planned_meals").upsert(
    {
      user_id: user.id,
      date: localToday(),
      slot,
      position,
      origin: "manual",
      name,
      portions: [],
      swaps: [],
      why: null,
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
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

// Plan the whole day: estimate macros for pinned meals and fill every empty
// slot from the pantry, so the day's totals hit the macro budget. Meals the
// user has already eaten (logged) are left untouched and stay counted.
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

  // Slots to plan: everything the user hasn't already eaten. A manual row
  // carries the user's pinned meal; anything else is treated as empty.
  const toPlan = slotNames.filter((s) => !bySlot.get(s)?.logged_food_id);
  const slotsInput = toPlan.map((slot) => {
    const existing = bySlot.get(slot);
    return {
      slot,
      pinned: existing?.origin === "manual" ? existing.name : null,
    };
  });

  const budget = {
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
    slots: slotsInput,
  });

  const bySlotResult = new Map(meals.map((m) => [m.slot, m]));

  const rows = toPlan
    .map((slot) => {
      const m = bySlotResult.get(slot);
      if (!m) return null;
      const existing = bySlot.get(slot);
      const isManual = existing?.origin === "manual";
      return {
        user_id: user.id,
        date: localToday(),
        slot,
        position: Math.max(0, slotNames.indexOf(slot)),
        origin: isManual ? "manual" : "ai",
        // Keep the user's own wording for a pinned meal; only its macros are new.
        name: isManual ? existing!.name : m.name,
        portions: isManual ? [] : m.portions,
        swaps: isManual ? [] : m.swaps,
        why: isManual ? null : m.why,
        kcal: m.kcal,
        protein_g: m.protein_g,
        carbs_g: m.carbs_g,
        fat_g: m.fat_g,
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
    .select("name, kcal, protein_g, carbs_g, fat_g, logged_food_id")
    .eq("id", id)
    .maybeSingle();
  if (!meal) throw new Error("Meal not found");
  const m = meal as {
    name: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
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
