"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  measurementCmSchema,
  parseOrThrow,
  weightKgSchema,
} from "@/lib/validate";

// Log a weight. Defaults to today; pass an ISO date (YYYY-MM-DD) to back-fill a
// day the user forgot. Upserts on (user_id, date) so re-logging a day overwrites.
export async function logWeight(weightKg: number, dateISO?: string) {
  const { supabase, user } = await requireUser();

  // A weigh-in feeds the trailing average the coach cuts or raises calories
  // from. A NaN or a stray 850 doesn't error — it drags the average and changes
  // what the user is told to eat.
  const weight = parseOrThrow(weightKgSchema, weightKg, "Weight");

  const row: { user_id: string; weight_kg: number; date?: string } = {
    user_id: user.id,
    weight_kg: weight,
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

  // The waist reading is what lets the coach say "scale flat but you're losing
  // fat" and hold the target. A junk value there changes that call.
  const checked = Object.fromEntries(
    Object.entries(input).map(([field, value]) => [
      field,
      value == null ? null : parseOrThrow(measurementCmSchema, value, field),
    ]),
  ) as unknown as MeasurementInput;

  const { error } = await supabase
    .from("measurements")
    .upsert(
      { user_id: user.id, ...checked },
      { onConflict: "user_id,date" },
    );
  if (error) throw new Error(error.message);

  revalidatePath("/progress");
}
