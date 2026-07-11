"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ageFromBirthYear, dailyTarget, weekStart } from "@/lib/coach";
import type {
  ActivityLevel,
  DietType,
  GoalPace,
  Sex,
} from "@/lib/types";

export interface OnboardingInput {
  diet_type: DietType;
  allergies: string[];
  dislikes: string[];
  goal_pace: GoalPace;
  activity_level: ActivityLevel;
  sex: Sex;
  height_cm: number;
  weight_kg: number;
  birth_year: number;
}

export async function saveOnboarding(input: OnboardingInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 1. Save the profile.
  const { error: profileError } = await supabase.from("users").upsert({
    id: user.id,
    email: user.email,
    diet_type: input.diet_type,
    allergies: input.allergies,
    dislikes: input.dislikes,
    goal: "lose",
    goal_pace: input.goal_pace,
    activity_level: input.activity_level,
    height_cm: input.height_cm,
    sex: input.sex,
    birth_year: input.birth_year,
    onboarded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (profileError) throw new Error(profileError.message);

  // 2. Record the starting weight.
  const { error: weightError } = await supabase
    .from("weights")
    .upsert(
      { user_id: user.id, weight_kg: input.weight_kg },
      { onConflict: "user_id,date" },
    );
  if (weightError) throw new Error(weightError.message);

  // 3. Compute and store this week's macro target.
  const target = dailyTarget({
    sex: input.sex,
    diet: input.diet_type,
    weightKg: input.weight_kg,
    heightCm: input.height_cm,
    age: ageFromBirthYear(input.birth_year),
    activity: input.activity_level,
    pace: input.goal_pace,
  });

  const { error: targetError } = await supabase
    .from("daily_targets")
    .upsert(
      { user_id: user.id, week_start: weekStart(), ...target },
      { onConflict: "user_id,week_start" },
    );
  if (targetError) throw new Error(targetError.message);

  redirect("/dashboard");
}
