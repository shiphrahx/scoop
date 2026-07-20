"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { ageFromBirthYear, averageActiveKcal, dailyTarget } from "@/lib/coach";
import { getTimezone } from "@/lib/queries";
import { localWeekStart } from "@/lib/time";
import type { ActivityLevel, DietType, GoalPace } from "@/lib/types";

// Save the user's own Anthropic API key. It's read server-side only (never
// sent back to the browser) and powers the AI features on this account.
export async function saveApiKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed.startsWith("sk-ant-")) {
    throw new Error("That doesn't look like an Anthropic key (starts sk-ant-).");
  }
  const { supabase, user } = await requireUser();
  // Store encrypted — a DB dump then yields ciphertext, not a live billable key.
  const { error } = await supabase
    .from("users")
    .update({
      anthropic_api_key: encryptSecret(trimmed),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/me");
}

// Days of device history the trailing active-energy average reads.
const ACTIVE_WINDOW_DAYS = 7;

export interface GoalsInput {
  diet_type: DietType;
  activity_level: ActivityLevel;
  goal_pace: GoalPace;
}

// Update the user's diet + activity + pace, then recompute this week's macro
// target from their latest weight (same maths onboarding used).
export async function saveGoals(input: GoalsInput) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("users")
    .update({
      diet_type: input.diet_type,
      activity_level: input.activity_level,
      goal_pace: input.goal_pace,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  // Window for the trailing average of measured active energy.
  const cut7 = new Date(Date.now() - (ACTIVE_WINDOW_DAYS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [{ data: prof }, { data: w }, { data: act }] = await Promise.all([
    supabase
      .from("users")
      .select("height_cm, sex, birth_year")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("weights")
      .select("weight_kg")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("activity")
      .select("workout_kcal")
      .gte("date", cut7),
  ]);

  const p = prof as
    | { height_cm: number | null; sex: "male" | "female" | null; birth_year: number | null }
    | null;
  const weightKg = w ? Number((w as { weight_kg: number }).weight_kg) : null;

  // Average the week's measured active energy. Null when the device data is too
  // patchy to describe a week, which leaves dailyTarget on the self-reported
  // activity multiplier rather than extrapolating a couple of gym days.
  const activeKcalPerDay = averageActiveKcal(
    ((act as { workout_kcal: number | null }[]) ?? []).map((r) => r.workout_kcal),
    ACTIVE_WINDOW_DAYS,
  );

  if (p?.height_cm && p.sex && p.birth_year && weightKg) {
    const target = dailyTarget({
      sex: p.sex,
      diet: input.diet_type,
      weightKg,
      heightCm: Number(p.height_cm),
      age: ageFromBirthYear(p.birth_year),
      activity: input.activity_level,
      pace: input.goal_pace,
      activeKcalPerDay,
    });
    await supabase
      .from("daily_targets")
      .upsert(
        { user_id: user.id, week_start: localWeekStart(await getTimezone()), ...target },
        { onConflict: "user_id,week_start" },
      );
  }

  revalidatePath("/me");
  revalidatePath("/");
}

// Save the user's meal-slot list (the named meals a day breaks into, e.g.
// Breakfast/Lunch/Snack/Dinner). Trimmed, de-duplicated, order preserved.
export async function saveMealSlots(slots: string[]) {
  const cleaned: string[] = [];
  for (const s of slots) {
    const name = s.trim();
    if (name && !cleaned.some((c) => c.toLowerCase() === name.toLowerCase())) {
      cleaned.push(name);
    }
  }
  if (cleaned.length === 0) {
    throw new Error("Keep at least one meal.");
  }

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("users")
    .update({ meal_slots: cleaned, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/me");
  revalidatePath("/plan/day");
}

// Save how big each meal should be relative to the others (slot name ->
// relative weight). The day planner splits the day's macros by these. Weights
// are relative, so any positive scale works; zero/negative/NaN would starve or
// blow up a meal's share and are refused.
export async function saveSlotWeights(weights: Record<string, number>) {
  const cleaned: Record<string, number> = {};
  for (const [slot, w] of Object.entries(weights)) {
    const name = slot.trim();
    const n = Number(w);
    if (!name) continue;
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`Meal size for ${name} must be a positive number.`);
    }
    cleaned[name] = Math.round(n);
  }

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("users")
    .update({ slot_weights: cleaned, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/me");
  revalidatePath("/plan/day");
}

// Save which nutrients the user wants shown in breakdowns. Validated against
// the known selectable keys, order preserved.
export async function saveNutrientPrefs(prefs: string[]) {
  const { SELECTABLE_NUTRIENTS } = await import("@/lib/nutrients");
  const allowed = new Set<string>(SELECTABLE_NUTRIENTS);
  const cleaned = prefs.filter((p) => allowed.has(p));
  if (cleaned.length === 0) throw new Error("Pick at least one nutrient.");

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("users")
    .update({ nutrient_prefs: cleaned, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/me");
  revalidatePath("/dashboard");
  revalidatePath("/plan/day");
}

export async function clearApiKey() {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("users")
    .update({ anthropic_api_key: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/me");
}
