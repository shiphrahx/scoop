"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isFoodAllowed } from "@/lib/ai";
import { planPickedDay, portionGrams, type PantryFood } from "@/lib/mealplan";
import { macrosPer100gSchema, parseOrThrow, portionGramsSchema } from "@/lib/validate";
import {
  getConsumedForDate,
  getCurrentTargets,
  getPlanForDate,
  getProfile,
  getTimezone,
  localToday,
} from "@/lib/queries";
import { addDaysISO, dayRangeFor } from "@/lib/time";
import {
  sumItems,
  type DietType,
  type FoodChoice,
  type MealPick,
  type MealPortion,
  type PlanItem,
  type Macros,
} from "@/lib/types";

function revalidate() {
  revalidatePath("/plan/day");
  revalidatePath("/dashboard");
}

// The day an action targets. Slots are keyed by (user, date, slot), so a bad
// value would write onto the wrong calendar day; only YYYY-MM-DD is accepted,
// and anything missing or malformed falls back to today.
async function resolveDate(date?: string): Promise<string> {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return localToday();
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
    .select(
      "name, off_barcode, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, satfat_100g, sodium_mg_100g, pack_size_g, quantity, unit_g, unit_label",
    );
  return (
    (data as Array<{
      name: string;
      off_barcode: string | null;
      kcal_100g: number;
      protein_100g: number;
      carbs_100g: number;
      fat_100g: number;
      fiber_100g: number | null;
      sugar_100g: number | null;
      satfat_100g: number | null;
      sodium_mg_100g: number | null;
      pack_size_g: number | null;
      quantity: number | null;
      unit_g: number | null;
      unit_label: string | null;
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
        off_barcode: p.off_barcode,
        kcal_100g: Number(p.kcal_100g),
        protein_100g: Number(p.protein_100g),
        carbs_100g: Number(p.carbs_100g),
        fat_100g: Number(p.fat_100g),
        fiber_100g: Number(p.fiber_100g ?? 0),
        sugar_100g: Number(p.sugar_100g ?? 0),
        satfat_100g: Number(p.satfat_100g ?? 0),
        sodium_mg_100g: Number(p.sodium_mg_100g ?? 0),
        available_g: pack != null ? pack * qty : undefined,
        unit_g: p.unit_g != null ? Number(p.unit_g) : null,
        unit_label: p.unit_label,
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
      "name, off_barcode, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, satfat_100g, sodium_mg_100g, pack_size_g, unit_g, unit_label",
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
      unit_g: number | null;
      unit_label: string | null;
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
    unit_g: p.unit_g != null ? Number(p.unit_g) : null,
    unit_label: p.unit_label,
  }));
}

// Save the list of foods the user picked for a slot. Empty list clears the
// slot. Macros are the exact sum of the items — no AI estimate needed.
export async function setMealItems(slot: string, items: PlanItem[], date?: string) {
  const { supabase, user } = await requireUser();
  const day = await resolveDate(date);

  if (items.length === 0) {
    await supabase
      .from("planned_meals")
      .delete()
      .eq("user_id", user.id)
      .eq("date", day)
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
      date: day,
      slot,
      position,
      origin: "manual",
      name,
      items,
      // A hand-built meal replaces any waiting picks for the slot.
      picks: [],
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

// Save the foods the user picked for one meal, ahead of "Build my day". No
// grams yet — the global solve works those out. Changing the picks resets any
// previously solved portions (they were for the old picks). Empty picks clear
// the slot back to empty.
export async function setMealPicks(slot: string, picks: MealPick[], date?: string) {
  const { supabase, user } = await requireUser();
  const day = await resolveDate(date);

  // Never touch an eaten meal: its macros are already in the food log.
  const { data: existing } = await supabase
    .from("planned_meals")
    .select("logged_food_id")
    .eq("user_id", user.id)
    .eq("date", day)
    .eq("slot", slot)
    .maybeSingle();
  if ((existing as { logged_food_id: string | null } | null)?.logged_food_id) {
    throw new Error("This meal is already logged — edit it from the plan instead.");
  }

  if (picks.length === 0) {
    await supabase
      .from("planned_meals")
      .delete()
      .eq("user_id", user.id)
      .eq("date", day)
      .eq("slot", slot);
    revalidate();
    return;
  }

  // A pick's numbers come from the pantry or a barcode lookup, but the payload
  // itself is client-supplied — bound-check it before it can poison a build.
  for (const p of picks) {
    parseOrThrow(macrosPer100gSchema, p, `Pick ${p.name}`);
  }

  const profile = await getProfile();
  const position = Math.max(0, (profile?.meal_slots ?? []).indexOf(slot));

  const { error } = await supabase.from("planned_meals").upsert(
    {
      user_id: user.id,
      date: day,
      slot,
      position,
      origin: "ai",
      name: picks.map((p) => p.name).join(", "),
      items: [],
      picks,
      portions: [],
      swaps: [],
      why: null,
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
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

// Resolve one stored pick to the food the solver portions. Always prefer the
// pantry's CURRENT row — matched by name, else by barcode — whatever the pick's
// source: it carries the freshest numbers AND the real stock/pack cap, so a
// pick can never be portioned past the pack the user actually has. A scanned
// pick that was later saved to the pantry (or whose pack size was unknown when
// scanned) is capped too. Only a food that isn't in the pantry falls back to
// the pick's own numbers, capped at its pack size when the pick carried one.
function pickToFood(pick: MealPick, pantry: PantryFood[]): PantryFood {
  const hit =
    pantry.find((f) => f.name === pick.name) ??
    (pick.off_barcode
      ? pantry.find((f) => f.off_barcode != null && f.off_barcode === pick.off_barcode)
      : undefined);
  if (hit) return hit;
  return {
    name: pick.name,
    kcal_100g: Number(pick.kcal_100g),
    protein_100g: Number(pick.protein_100g),
    carbs_100g: Number(pick.carbs_100g),
    fat_100g: Number(pick.fat_100g),
    fiber_100g: Number(pick.fiber_100g ?? 0),
    sugar_100g: Number(pick.sugar_100g ?? 0),
    satfat_100g: Number(pick.satfat_100g ?? 0),
    sodium_mg_100g: Number(pick.sodium_mg_100g ?? 0),
    available_g: pick.pack_size_g != null ? Number(pick.pack_size_g) : undefined,
    unit_g: pick.unit_g != null ? Number(pick.unit_g) : null,
    unit_label: pick.unit_label ?? null,
  };
}

// Portion every meal the user picked foods for, together, so the day lands on
// target. Meals the user built by hand and meals already eaten are budgeted
// around, never touched. Picked meals split what's left of the day between
// them by the user's slot weights. Also serves as "rebalance": running it
// again re-portions every unlogged picked meal from its saved picks.
export async function buildMyDay(date?: string) {
  const { supabase, user } = await requireUser();
  const day = await resolveDate(date);

  const [profile, targets, consumed, plan] = await Promise.all([
    getProfile(),
    getCurrentTargets(),
    getConsumedForDate(day),
    getPlanForDate(day),
  ]);
  if (!profile) throw new Error("Finish onboarding first");
  if (!targets) throw new Error("No macro target yet — finish onboarding.");

  const picked = plan.filter((p) => p.picks.length > 0 && !p.logged_food_id);
  if (picked.length === 0) {
    throw new Error("Pick foods for at least one meal first.");
  }

  const pantry = await pantryFoods(
    supabase,
    profile.diet_type,
    profile.allergies ?? [],
    profile.dislikes ?? [],
  );

  // Meals that are planned but NOT being solved (built by hand, no picks) hold
  // their macros; the picked meals absorb everything else that's left today.
  const fixed = plan
    .filter((p) => !p.logged_food_id && p.picks.length === 0)
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
    kcal: Math.max(0, Math.round(targets.kcal - consumed.kcal - fixed.kcal)),
    protein_g: Math.max(
      0,
      Math.round(targets.protein_g - consumed.protein_g - fixed.protein_g),
    ),
    carbs_g: Math.max(
      0,
      Math.round(targets.carbs_g - consumed.carbs_g - fixed.carbs_g),
    ),
    fat_g: Math.max(0, Math.round(targets.fat_g - consumed.fat_g - fixed.fat_g)),
  };

  const meals = planPickedDay({
    slots: picked.map((p) => ({
      slot: p.slot,
      foods: p.picks.map((pick) => pickToFood(pick, pantry)),
    })),
    budget,
    weights: profile.slot_weights ?? undefined,
  });

  const bySlot = new Map(meals.map((m) => [m.slot, m]));
  const slotNames = profile.meal_slots ?? [];
  for (const row of picked) {
    const m = bySlot.get(row.slot);
    const patch = m
      ? {
          name: m.name,
          portions: m.portions,
          swaps: m.swaps,
          why: m.why,
          kcal: m.kcal,
          protein_g: m.protein_g,
          carbs_g: m.carbs_g,
          fat_g: m.fat_g,
          fiber_g: m.fiber_g ?? 0,
          sugar_g: m.sugar_g ?? 0,
          satfat_g: m.satfat_g ?? 0,
          sodium_mg: m.sodium_mg ?? 0,
        }
      : {
          // Nothing fitted this meal at all — keep the picks, explain why.
          portions: [],
          why: "No room left in today's macros for this meal — change the picks or free something up.",
          kcal: 0,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
          sugar_g: 0,
          satfat_g: 0,
          sodium_mg: 0,
        };
    const { error } = await supabase
      .from("planned_meals")
      .update({
        position: Math.max(0, slotNames.indexOf(row.slot)),
        ...patch,
      })
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  }
  revalidate();
}

// Fill a slot with the same meal the user had in it the day before — a whole
// row copied onto this date, minus the "eaten" mark so it lands as a fresh
// plan. Overwrites whatever is in the slot (the button only shows on empty
// slots). Throws when the previous day had nothing planned there.
export async function copyFromYesterday(slot: string, date?: string) {
  const { supabase, user } = await requireUser();
  const day = await resolveDate(date);
  const prevDay = addDaysISO(day, -1);

  const { data: src } = await supabase
    .from("planned_meals")
    .select(
      "origin, name, items, picks, portions, swaps, why, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg",
    )
    .eq("user_id", user.id)
    .eq("date", prevDay)
    .eq("slot", slot)
    .maybeSingle();
  if (!src) throw new Error("Nothing planned for this meal yesterday.");
  const m = src as {
    origin: string;
    name: string;
    items: PlanItem[];
    picks: MealPick[] | null;
    portions: MealPortion[];
    swaps: string[];
    why: string | null;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    satfat_g: number;
    sodium_mg: number;
  };

  const profile = await getProfile();
  const position = Math.max(0, (profile?.meal_slots ?? []).indexOf(slot));

  const { error } = await supabase.from("planned_meals").upsert(
    {
      user_id: user.id,
      date: day,
      slot,
      position,
      origin: m.origin,
      name: m.name,
      items: m.items,
      picks: m.picks ?? [],
      portions: m.portions,
      swaps: m.swaps,
      why: m.why,
      kcal: m.kcal,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      fiber_g: m.fiber_g,
      sugar_g: m.sugar_g,
      satfat_g: m.satfat_g,
      sodium_mg: m.sodium_mg,
      logged_food_id: null,
    },
    { onConflict: "user_id,date,slot" },
  );
  if (error) throw new Error(error.message);
  revalidate();
}

// A short dish name from its portions: "Chicken with Rice", or the single food.
function portionsName(portions: MealPortion[]): string {
  const names = portions.map((p) => p.name);
  if (names.length === 0) return "Pantry meal";
  if (names.length === 1) return names[0];
  return `${names[0]} with ${names[1]}`;
}

// Save an edited AI dish: the user changed the portions (grams, or dropped an
// ingredient). Totals are re-summed from the portions' own macros, so the meal
// and the day stay exact. Removing every portion clears the slot.
export async function setMealPortions(id: string, portions: MealPortion[]) {
  const { supabase, user } = await requireUser();

  // The grams come off a slider. A NaN would be summed into the meal, then into
  // the day, and every total downstream reads NaN from then on.
  for (const p of portions) {
    parseOrThrow(portionGramsSchema, p.grams, `Portion of ${p.name}`);
  }

  if (portions.length === 0) {
    const { error } = await supabase
      .from("planned_meals")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .is("logged_food_id", null);
    if (error) throw new Error(error.message);
    revalidate();
    return;
  }

  // Re-sum every nutrient the portions carry, extras included — dropping them
  // here would zero a meal's fibre and sodium the moment the user edited it.
  const totals = portions.reduce(
    (s, p) => ({
      kcal: s.kcal + (p.kcal ?? 0),
      protein_g: s.protein_g + (p.protein_g ?? 0),
      carbs_g: s.carbs_g + (p.carbs_g ?? 0),
      fat_g: s.fat_g + (p.fat_g ?? 0),
      fiber_g: s.fiber_g + (p.fiber_g ?? 0),
      sugar_g: s.sugar_g + (p.sugar_g ?? 0),
      satfat_g: s.satfat_g + (p.satfat_g ?? 0),
      sodium_mg: s.sodium_mg + (p.sodium_mg ?? 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, satfat_g: 0, sodium_mg: 0 },
  );

  const { error } = await supabase
    .from("planned_meals")
    .update({
      name: portionsName(portions),
      portions,
      kcal: Math.round(totals.kcal),
      protein_g: Math.round(totals.protein_g),
      carbs_g: Math.round(totals.carbs_g),
      fat_g: Math.round(totals.fat_g),
      fiber_g: Math.round(totals.fiber_g),
      sugar_g: Math.round(totals.sugar_g),
      satfat_g: Math.round(totals.satfat_g),
      sodium_mg: Math.round(totals.sodium_mg),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("logged_food_id", null);
  if (error) throw new Error(error.message);
  revalidate();
}

// Remove everything the app planned for today that the user hasn't eaten yet —
// for when they don't like the auto-plan and want to start over. Meals they
// built themselves (origin 'manual') and anything already logged are left
// untouched (deleting a logged meal would orphan its food-log entry).
export async function clearAppPlan(date?: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("planned_meals")
    .delete()
    .eq("user_id", user.id)
    .eq("date", await resolveDate(date))
    .eq("origin", "ai")
    .is("logged_food_id", null);
  if (error) throw new Error(error.message);
  revalidate();
}

// Empty a slot again.
export async function clearSlot(slot: string, date?: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("planned_meals")
    .delete()
    .eq("user_id", user.id)
    .eq("date", await resolveDate(date))
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

// Log a planned meal to the day's food and mark the slot done. When the meal is
// on another calendar day, stamp the log at that day's local midnight so it
// counts toward that day's totals, not now's.
export async function logPlannedMeal(id: string, date?: string) {
  const { supabase, user } = await requireUser();
  const day = await resolveDate(date);

  const { data: meal } = await supabase
    .from("planned_meals")
    .select(
      "name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg, logged_food_id",
    )
    .eq("id", id)
    // Scope to the owner as well as in RLS. Without it a guessed id would log
    // someone else's meal into this user's diary and move their day's calories.
    .eq("user_id", user.id)
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

  // Today logs at now(); another day logs at that day's local midnight so it
  // lands in the right day's [midnight, midnight) window.
  const today = await localToday();
  const loggedAt =
    day === today ? undefined : dayRangeFor(await getTimezone(), day).start.toISOString();

  const { data: log, error } = await supabase
    .from("food_logs")
    .insert({
      user_id: user.id,
      name: m.name,
      source: "manual",
      grams: null,
      ...(loggedAt ? { logged_at: loggedAt } : {}),
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
    .eq("id", id)
    .eq("user_id", user.id);

  revalidate();
}
