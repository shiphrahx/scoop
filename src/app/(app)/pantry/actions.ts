"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseGroceryImage } from "@/lib/ai";
import type { GroceryItem } from "@/lib/types";

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
  pack_size_g?: number | null;
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
    pack_size_g: input.pack_size_g ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/pantry");
}

// Save a batch of items the user confirmed in the import matcher (#6). Each row
// carries the macros + pack size of the chosen Open Food Facts match (or zeros
// when the user kept it unmatched), plus how many packs they have.
export async function addMatchedItems(items: PantryInput[]) {
  const { supabase, user } = await requireUser();
  const rows = items
    .filter((it) => it.name.trim())
    .map((it) => ({
      user_id: user.id,
      name: it.name.trim(),
      off_barcode: it.off_barcode,
      quantity: Math.max(1, Math.round(it.quantity || 1)),
      kcal_100g: it.kcal_100g,
      protein_100g: it.protein_100g,
      carbs_100g: it.carbs_100g,
      fat_100g: it.fat_100g,
      pack_size_g: it.pack_size_g ?? null,
    }));
  if (rows.length === 0) return;

  const { error } = await supabase.from("pantry_items").insert(rows);
  if (error) throw new Error(error.message);

  revalidatePath("/pantry");
}

// Look up Open Food Facts candidates for an imported item name (server action
// wrapper so import UIs don't call the route directly).
export async function matchCandidates(name: string) {
  await requireUser();
  const { searchProducts } = await import("@/lib/off");
  return searchProducts(name);
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

// Read a grocery screenshot into a list of items (AI, user's own key). Returns
// the parsed items for the user to confirm before anything is saved.
export async function scanGroceries(
  base64: string,
  mediaType: "image/png" | "image/jpeg" | "image/webp",
): Promise<GroceryItem[]> {
  await requireUser();
  return parseGroceryImage(base64, mediaType);
}

// Add the items the user picked from a scan to their pantry.
export async function addGroceryItems(items: GroceryItem[]) {
  const { supabase, user } = await requireUser();
  if (items.length === 0) return;

  const rows = items.map((it) => ({
    user_id: user.id,
    name: it.name,
    off_barcode: null,
    quantity: 1,
    kcal_100g: it.kcal_100g,
    protein_100g: it.protein_100g,
    carbs_100g: it.carbs_100g,
    fat_100g: it.fat_100g,
  }));

  const { error } = await supabase.from("pantry_items").insert(rows);
  if (error) throw new Error(error.message);

  revalidatePath("/pantry");
}
