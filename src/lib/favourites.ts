// Turning a planned meal into the foods a favourite meal stores.
//
// A favourite meal keeps its foods as PlanItem[] — the same shape a hand-built
// meal uses — so adding it back rebuilds an identical, editable meal. A meal the
// user built by hand already IS a PlanItem[] (`items`); an app-portioned dish is
// a list of MealPortion (grams + the macros of that portion), so we recover each
// food's per-100g macros from what the portion contributed.

import type { MealPortion, PlanItem } from "@/lib/types";

// One AI portion → a PlanItem. Per-100g macros are back-calculated from the
// portion's stored macros over its grams (macro / grams × 100). A portion with
// no stored macros (an old plan) or zero grams contributes zeroes — it can't be
// rescaled, so it's kept only as a name at that amount.
function portionToItem(p: MealPortion): PlanItem {
  const g = p.grams > 0 ? p.grams : 0;
  const per = (v: number | undefined) => (g > 0 ? ((v ?? 0) / g) * 100 : 0);
  return {
    name: p.name,
    source: "pantry",
    off_barcode: null,
    grams: p.grams,
    kcal_100g: per(p.kcal),
    protein_100g: per(p.protein_g),
    carbs_100g: per(p.carbs_g),
    fat_100g: per(p.fat_g),
    fiber_100g: per(p.fiber_g),
    sugar_100g: per(p.sugar_g),
    satfat_100g: per(p.satfat_g),
    sodium_mg_100g: per(p.sodium_mg),
    unit_g: p.unit_g ?? null,
    unit_label: p.unit_label ?? null,
  };
}

// The foods of a meal as PlanItem[]: a hand-built meal's own items when it has
// them, otherwise its AI portions converted. Used to save a meal as a favourite.
export function mealToItems(meal: {
  items?: PlanItem[] | null;
  portions?: MealPortion[] | null;
}): PlanItem[] {
  if (meal.items && meal.items.length > 0) return meal.items;
  return (meal.portions ?? []).map(portionToItem);
}
