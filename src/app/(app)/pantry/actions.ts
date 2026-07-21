"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { parseGroceryImage, parseProductFromUrl } from "@/lib/ai";
import { pantryCategory } from "@/lib/foodgroups";
import { searchFreshFoods } from "@/lib/queries";
import { macrosPer100gSchema, parseOrThrow } from "@/lib/validate";
import type { FreshFood, GroceryItem, ParsedProduct, UnitOption } from "@/lib/types";

export interface PantryInput {
  name: string;
  off_barcode: string | null;
  quantity: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g?: number;
  sugar_100g?: number;
  satfat_100g?: number;
  sodium_mg_100g?: number;
  pack_size_g?: number | null;
  unit_g?: number | null;
  unit_label?: string | null;
  // The sizes a fresh food comes in (small/medium/large…). Stored alongside the
  // selected unit_g/unit_label so the user can switch size later. Omitted for a
  // weighed or packaged item.
  unit_options?: UnitOption[] | null;
  // The shelf to file it under. Omitted by every add path so it's assigned
  // automatically from name + macros (see `shelf`).
  category?: string | null;
}

// Reject a food whose per-100g macros can't be real before it reaches the
// pantry — a bad barcode record or a misread label can carry "170 g protein per
// 100 g", which the day planner later refuses to portion, stranding a food the
// user could save but never use. Caught here, at the point they can still fix
// the number. `label` names the food in the error the user reads.
function assertMacros(
  food: {
    kcal_100g: number;
    protein_100g: number;
    carbs_100g: number;
    fat_100g: number;
  },
  label: string,
) {
  parseOrThrow(macrosPer100gSchema, food, label);
}

// The category to file a new item under: honour an explicit one if given,
// otherwise pick a shelf from its name and macros so every add path — barcode,
// link, screenshot, import, manual — files itself with no extra tapping.
function shelf(it: PantryInput): string {
  return (
    it.category?.trim() ||
    pantryCategory(it.name, {
      protein_100g: it.protein_100g,
      carbs_100g: it.carbs_100g,
      fat_100g: it.fat_100g,
    })
  );
}

// The extra per-100g nutrient columns, defaulted to 0 when a source didn't
// report them — shared by both pantry inserts.
function extraCols(it: PantryInput) {
  return {
    fiber_100g: it.fiber_100g ?? 0,
    sugar_100g: it.sugar_100g ?? 0,
    satfat_100g: it.satfat_100g ?? 0,
    sodium_mg_100g: it.sodium_mg_100g ?? 0,
  };
}

// The countable-unit columns, defaulted to null (weighed in grams) — shared by
// both pantry inserts so a scanned/imported item keeps OFF's serving. A fresh
// food carries its whole set of sizes too, so the user can switch size later.
function unitCols(it: PantryInput) {
  const options = (it.unit_options ?? []).filter((o) => o.label.trim() && o.grams > 0);
  return {
    unit_g: it.unit_g ?? null,
    unit_label: it.unit_label?.trim() || null,
    unit_options: options.length ? options : null,
  };
}

export async function addPantryItem(input: PantryInput) {
  const { supabase, user } = await requireUser();
  assertMacros(input, input.name.trim() || "This item");

  const { error } = await supabase.from("pantry_items").insert({
    user_id: user.id,
    name: input.name,
    off_barcode: input.off_barcode,
    quantity: input.quantity,
    kcal_100g: input.kcal_100g,
    protein_100g: input.protein_100g,
    carbs_100g: input.carbs_100g,
    fat_100g: input.fat_100g,
    ...extraCols(input),
    pack_size_g: input.pack_size_g ?? null,
    ...unitCols(input),
    category: shelf(input),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/pantry");
}

// Save a batch of items the user confirmed in the import matcher (#6). Each row
// carries the macros + pack size of the chosen Open Food Facts match (or zeros
// when the user kept it unmatched), plus how many packs they have.
export async function addMatchedItems(items: PantryInput[]) {
  const { supabase, user } = await requireUser();
  const kept = items.filter((it) => it.name.trim());
  for (const it of kept) assertMacros(it, it.name.trim());
  const rows = kept
    .map((it) => ({
      user_id: user.id,
      name: it.name.trim(),
      off_barcode: it.off_barcode,
      quantity: Math.max(1, Math.round(it.quantity || 1)),
      kcal_100g: it.kcal_100g,
      protein_100g: it.protein_100g,
      carbs_100g: it.carbs_100g,
      fat_100g: it.fat_100g,
      ...extraCols(it),
      pack_size_g: it.pack_size_g ?? null,
      ...unitCols(it),
      category: shelf(it),
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

export interface PantryPatch {
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  pack_size_g: number | null;
  unit_g: number | null;
  unit_label: string | null;
  unit_options?: UnitOption[] | null;
  category: string | null;
}

// Edit an item's name, per-100g macros, pack size, and countable unit.
export async function updatePantryItem(id: string, patch: PantryPatch) {
  const { supabase } = await requireUser();
  if (!patch.name.trim()) throw new Error("Name can't be empty.");
  assertMacros(patch, patch.name.trim());

  // A unit needs a positive grams-per-unit to convert a count to grams; without
  // it there's nothing to count, so the food falls back to being weighed.
  const unit_g = patch.unit_g && patch.unit_g > 0 ? patch.unit_g : null;
  const options = (patch.unit_options ?? []).filter(
    (o) => o.label.trim() && o.grams > 0,
  );

  const { error } = await supabase
    .from("pantry_items")
    .update({
      name: patch.name.trim(),
      kcal_100g: Math.max(0, patch.kcal_100g) || 0,
      protein_100g: Math.max(0, patch.protein_100g) || 0,
      carbs_100g: Math.max(0, patch.carbs_100g) || 0,
      fat_100g: Math.max(0, patch.fat_100g) || 0,
      pack_size_g: patch.pack_size_g,
      unit_g,
      unit_label: unit_g ? patch.unit_label?.trim() || null : null,
      unit_options: options.length ? options : null,
      category: patch.category?.trim() || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/pantry");
}

// Switch which size of a fresh food the user currently has (small→large), by
// picking one of the item's own unit_options. Its own action so the pantry row
// can change size in one tap. Ignored if the label isn't one the item carries.
export async function setPantryUnit(id: string, label: string) {
  const { supabase } = await requireUser();

  const { data } = await supabase
    .from("pantry_items")
    .select("unit_options")
    .eq("id", id)
    .maybeSingle();
  const options = ((data as { unit_options: UnitOption[] | null } | null)?.unit_options) ?? [];
  const pick = options.find((o) => o.label.trim().toLowerCase() === label.trim().toLowerCase());
  if (!pick) return;

  const { error } = await supabase
    .from("pantry_items")
    .update({ unit_g: pick.grams, unit_label: label.trim() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/pantry");
}

// Find fresh whole foods matching what the user is typing (server-action wrapper
// so the add form can search the shared reference without hitting a route).
export async function findFreshFoods(query: string): Promise<FreshFood[]> {
  await requireUser();
  return searchFreshFoods(query);
}

// Contribute a size to a fresh food in the shared reference (the user knows the
// weight of a size we don't have). created_by = them, so RLS lets them add it
// and own it. A duplicate label for the food is swallowed — someone got there
// first, which is fine.
export async function addFreshFoodSize(foodId: string, label: string, grams: number) {
  const { supabase, user } = await requireUser();
  const clean = label.trim();
  if (!clean || !(grams > 0)) return;

  const { error } = await supabase.from("fresh_food_sizes").insert({
    food_id: foodId,
    label: clean,
    grams,
    created_by: user.id,
  });
  // 23505 = unique_violation: the size already exists, nothing to do.
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(error.message);
  }
}

// Move one item to another shelf. Its own action (not the full edit) so the
// pantry list can re-file an item in a single tap. Empty string clears it back
// to uncategorised ("Other").
export async function setPantryCategory(id: string, category: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("pantry_items")
    .update({ category: category.trim() || null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/pantry");
}

export async function deletePantryItem(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("pantry_items").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/pantry");
}

// Empty the whole pantry for the current user (RLS scopes the delete to them).
export async function clearPantry() {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("pantry_items")
    .delete()
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/pantry");
}

// Read a shop product page (a link the user pasted) into one pantry item, ready
// to review in the form. AI, user's own key. Rate-limited per user because it
// makes an outbound fetch — can't be driven in a tight loop.
export async function importPantryUrl(url: string): Promise<ParsedProduct> {
  const { user } = await requireUser();
  if (!rateLimit(`pantry-url:${user.id}`, 10, 60_000)) {
    throw new Error("Too many imports — give it a minute and try again.");
  }
  return parseProductFromUrl(url);
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

