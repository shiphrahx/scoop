"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface LogFoodInput {
  name: string;
  grams: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export async function logFood(input: LogFoodInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("food_logs").insert({
    user_id: user.id,
    name: input.name,
    source: "manual",
    grams: input.grams,
    kcal: input.kcal,
    protein_g: input.protein_g,
    carbs_g: input.carbs_g,
    fat_g: input.fat_g,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/add");
  revalidatePath("/");
}

export async function deleteFood(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("food_logs").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/add");
  revalidatePath("/");
}
