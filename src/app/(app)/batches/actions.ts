"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { SourcePack } from "@/lib/types";

export interface CreateBatchInput {
  name: string;
  source_packs: SourcePack[];
  total_cooked_g: number;
}

// Create a batch. We sum the packs' macros for the whole pot; macros-per-gram
// is derived later from these totals and total_cooked_g.
export async function createBatch(input: CreateBatchInput) {
  const { supabase, user } = await requireUser();

  const totals = input.source_packs.reduce(
    (sum, p) => ({
      kcal: sum.kcal + p.kcal,
      protein_g: sum.protein_g + p.protein_g,
      carbs_g: sum.carbs_g + p.carbs_g,
      fat_g: sum.fat_g + p.fat_g,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  const { error } = await supabase.from("batches").insert({
    user_id: user.id,
    name: input.name,
    source_packs: input.source_packs,
    total_cooked_g: input.total_cooked_g,
    remaining_g: input.total_cooked_g,
    ...totals,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/batches");
}

// Eat a serving from a batch: log the macros for `grams` and take that weight
// off what's left in the pot.
export async function eatFromBatch(id: string, grams: number) {
  const { supabase, user } = await requireUser();

  const { data: batch, error: readError } = await supabase
    .from("batches")
    .select(
      "name, total_cooked_g, remaining_g, kcal, protein_g, carbs_g, fat_g",
    )
    .eq("id", id)
    .single();
  if (readError) throw new Error(readError.message);

  const totalG = Number(batch.total_cooked_g);
  if (totalG <= 0) throw new Error("Batch has no weight recorded");
  const f = grams / totalG;

  const { error: logError } = await supabase.from("food_logs").insert({
    user_id: user.id,
    name: batch.name,
    source: "batch",
    grams,
    kcal: Math.round(Number(batch.kcal) * f),
    protein_g: Math.round(Number(batch.protein_g) * f),
    carbs_g: Math.round(Number(batch.carbs_g) * f),
    fat_g: Math.round(Number(batch.fat_g) * f),
  });
  if (logError) throw new Error(logError.message);

  const remaining = Math.max(0, Number(batch.remaining_g) - grams);
  const { error: updateError } = await supabase
    .from("batches")
    .update({ remaining_g: remaining })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/batches");
  revalidatePath("/");
}

export async function deleteBatch(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("batches").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/batches");
}
