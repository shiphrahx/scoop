"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ageFromBirthYear, dailyTarget, weekStart } from "@/lib/coach";
import type { ActivityLevel, DietType, GoalPace } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

// Save the user's own Anthropic API key. It's read server-side only (never
// sent back to the browser) and powers the AI features on this account.
export async function saveApiKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed.startsWith("sk-ant-")) {
    throw new Error("That doesn't look like an Anthropic key (starts sk-ant-).");
  }
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("users")
    .update({ anthropic_api_key: trimmed, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/me");
}

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

  const [{ data: prof }, { data: w }] = await Promise.all([
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
  ]);

  const p = prof as
    | { height_cm: number | null; sex: "male" | "female" | null; birth_year: number | null }
    | null;
  const weightKg = w ? Number((w as { weight_kg: number }).weight_kg) : null;

  if (p?.height_cm && p.sex && p.birth_year && weightKg) {
    const target = dailyTarget({
      sex: p.sex,
      weightKg,
      heightCm: Number(p.height_cm),
      age: ageFromBirthYear(p.birth_year),
      activity: input.activity_level,
      pace: input.goal_pace,
    });
    await supabase
      .from("daily_targets")
      .upsert(
        { user_id: user.id, week_start: weekStart(), ...target },
        { onConflict: "user_id,week_start" },
      );
  }

  revalidatePath("/me");
  revalidatePath("/");
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
