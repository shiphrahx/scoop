"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ageFromBirthYear, dailyTarget, maintenanceTarget, tdee } from "@/lib/coach";
import { localWeekStart, safeTimezone } from "@/lib/time";
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
  goal_weight_kg: number;
  body_fat_pct: number | null;
  birth_year: number;
  // How big each meal should be relative to the others (slot name -> relative
  // weight). Empty = every meal the same size. Used when planning a day.
  slot_weights: Record<string, number>;
  // Read from the browser, because the server's clock is UTC and the user's day
  // is not. Decides when their day (and their week) rolls over.
  timezone: string;
  // Experienced dieters can skip the maintenance-first calibration hold and start
  // losing straight away. We still learn their real burn in the background (the
  // TDEE correction runs regardless) — they just don't get the holding phase.
  skip_calibration?: boolean;
}

export async function saveOnboarding(input: OnboardingInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const age = ageFromBirthYear(input.birth_year);

  // The formula's maintenance estimate, stored so the progress screen can show
  // what we're calibrating from before any measurement exists. Raw (no
  // calibration factor) — a brand-new user hasn't earned a correction yet.
  const estimatedMaintenance = Math.round(
    tdee({
      sex: input.sex,
      diet: input.diet_type,
      weightKg: input.weight_kg,
      heightCm: input.height_cm,
      age,
      activity: input.activity_level,
      bodyFatPct: input.body_fat_pct,
      goalWeightKg: input.goal_weight_kg,
    }),
  );

  // New users start in a calibration hold at maintenance; experienced dieters
  // can opt to skip straight into the deficit.
  const calibrating = !input.skip_calibration;

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
    goal_weight_kg: input.goal_weight_kg,
    body_fat_pct: input.body_fat_pct,
    sex: input.sex,
    birth_year: input.birth_year,
    slot_weights: input.slot_weights,
    timezone: safeTimezone(input.timezone),
    estimated_maintenance_kcal: estimatedMaintenance,
    calibration_started_at: calibrating ? now.toISOString() : null,
    onboarded_at: now.toISOString(),
    updated_at: now.toISOString(),
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

  // 3. Compute and store this week's macro target. Calibrating users open at
  // maintenance (no deficit) so we can learn their real burn before cutting;
  // skippers open at the deficit their pace asks for.
  const macroInput = {
    sex: input.sex,
    diet: input.diet_type,
    weightKg: input.weight_kg,
    heightCm: input.height_cm,
    age,
    activity: input.activity_level,
    bodyFatPct: input.body_fat_pct,
    goalWeightKg: input.goal_weight_kg,
  };
  const target = calibrating
    ? maintenanceTarget(macroInput)
    : dailyTarget({ ...macroInput, pace: input.goal_pace });

  const { error: targetError } = await supabase
    .from("daily_targets")
    .upsert(
      {
        user_id: user.id,
        week_start: localWeekStart(safeTimezone(input.timezone)),
        phase: calibrating ? "calibration" : "deficit",
        ...target,
      },
      { onConflict: "user_id,week_start" },
    );
  if (targetError) throw new Error(targetError.message);

  redirect("/dashboard");
}
