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
  // from. A NaN or a stray 850 doesn't error, it drags the average and changes
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

// --- Non-scale victories -----------------------------------------------------

// Free text the user writes about themselves, so the only limits are sanity
// ones: something has to be there, and it can't be an essay in a list row.
const MAX_VICTORY_CHARS = 200;
const MAX_MILESTONE_CHARS = 60;

const todayISO = () => new Date().toISOString().slice(0, 10);

// Log a win the scale can't see. The scale stalls for weeks at a time and these
// are what carry someone through it, so they're kept as a dated record.
export async function addVictory(text: string, dateISO?: string) {
  const { supabase, user } = await requireUser();

  const clean = text.trim();
  if (!clean) throw new Error("Write what you did first.");
  if (clean.length > MAX_VICTORY_CHARS) {
    throw new Error(`Keep it under ${MAX_VICTORY_CHARS} characters.`);
  }

  const date =
    dateISO && /^\d{4}-\d{2}-\d{2}$/.test(dateISO) && dateISO <= todayISO()
      ? dateISO
      : todayISO();

  const { error } = await supabase
    .from("non_scale_victories")
    .insert({ user_id: user.id, text: clean, date });
  if (error) throw new Error(error.message);

  revalidatePath("/progress");
}

export async function deleteVictory(id: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("non_scale_victories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/progress");
}

// --- Custom milestones -------------------------------------------------------

// A milestone the user picked themselves. With a target weight the app ticks it
// off from the trend; without one (a clothing size, an event) they tick it by
// hand, see milestones() in src/lib/insights.ts.
export async function addMilestone(label: string, targetWeightKg?: number | null) {
  const { supabase, user } = await requireUser();

  const clean = label.trim();
  if (!clean) throw new Error("Name the milestone first.");
  if (clean.length > MAX_MILESTONE_CHARS) {
    throw new Error(`Keep it under ${MAX_MILESTONE_CHARS} characters.`);
  }

  const target =
    targetWeightKg == null
      ? null
      : parseOrThrow(weightKgSchema, targetWeightKg, "Target weight");

  const { error } = await supabase
    .from("custom_milestones")
    .insert({ user_id: user.id, label: clean, target_weight_kg: target });
  if (error) throw new Error(error.message);

  revalidatePath("/progress");
}

// Tick a milestone off, or un-tick one ticked by mistake. Only meaningful for a
// milestone with no target weight; one with a weight is decided by the trend.
export async function setMilestoneReached(id: string, reached: boolean) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("custom_milestones")
    .update({ reached_at: reached ? todayISO() : null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/progress");
}

export async function deleteMilestone(id: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("custom_milestones")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/progress");
}
