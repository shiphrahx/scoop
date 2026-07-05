"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// One-tap daily weight. Upserts so re-logging the same day overwrites.
export async function logWeight(weightKg: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase
    .from("weights")
    .upsert(
      { user_id: user.id, weight_kg: weightKg },
      { onConflict: "user_id,date" },
    );
  if (error) throw new Error(error.message);

  revalidatePath("/progress");
}

export interface MeasurementInput {
  chest_cm: number | null;
  waist_cm: number | null;
  arms_cm: number | null;
  thighs_cm: number | null;
  hips_cm: number | null;
}

// Weekly measurements. Upserts on the current date.
export async function logMeasurements(input: MeasurementInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase
    .from("measurements")
    .upsert(
      { user_id: user.id, ...input },
      { onConflict: "user_id,date" },
    );
  if (error) throw new Error(error.message);

  revalidatePath("/progress");
}
