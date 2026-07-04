"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

export interface PantryInput {
  name: string;
  off_barcode: string | null;
  quantity: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

export async function addPantryItem(input: PantryInput) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("pantry_items").insert({
    user_id: user.id,
    name: input.name,
    off_barcode: input.off_barcode,
    quantity: input.quantity,
    kcal_100g: input.kcal_100g,
    protein_100g: input.protein_100g,
    carbs_100g: input.carbs_100g,
    fat_100g: input.fat_100g,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/pantry");
}

// Bump quantity up or down. Hitting zero removes the item from the pantry.
export async function setPantryQuantity(id: string, quantity: number) {
  const { supabase } = await requireUser();

  if (quantity <= 0) {
    const { error } = await supabase.from("pantry_items").delete().eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("pantry_items")
      .update({ quantity })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/pantry");
}

export async function deletePantryItem(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("pantry_items").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/pantry");
}
