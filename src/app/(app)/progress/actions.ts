"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

// Log a weight. Defaults to today; pass an ISO date (YYYY-MM-DD) to back-fill a
// day the user forgot. Upserts on (user_id, date) so re-logging a day overwrites.
export async function logWeight(weightKg: number, dateISO?: string) {
  const { supabase, user } = await requireUser();

  const row: { user_id: string; weight_kg: number; date?: string } = {
    user_id: user.id,
    weight_kg: weightKg,
  };
  // Accept a valid, non-future date; otherwise fall back to the DB default (today).
  if (dateISO && /^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    const today = new Date().toISOString().slice(0, 10);
    if (dateISO <= today) row.date = dateISO;
  }

  const { error } = await supabase
    .from("weights")
    .upsert(row, { onConflict: "user_id,date" });
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
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("measurements")
    .upsert(
      { user_id: user.id, ...input },
      { onConflict: "user_id,date" },
    );
  if (error) throw new Error(error.message);

  revalidatePath("/progress");
}
