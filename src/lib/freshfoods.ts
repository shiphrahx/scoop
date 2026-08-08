// Helpers for turning a fresh-food reference pick (banana + its small/medium/
// large sizes) into a pantry item's countable unit. Pure and deterministic, so
// they're cheap to unit-test and carry no dependency on the database.

import type { FoodChoice, FreshFood, UnitOption } from "@/lib/types";

// What one selected size is called on a pantry item: "medium banana", so a plan
// or log can read "2 medium bananas". Folds the food name to lower case (the
// size label is already lower case in the reference) and trims both.
export function pantryUnitLabel(foodName: string, sizeLabel: string): string {
  const name = foodName.trim();
  const size = sizeLabel.trim();
  if (!size) return name.toLowerCase();
  if (!name) return size;
  return `${size} ${name}`.toLowerCase();
}

// The size a food defaults to when the user first adds it: "medium" if it has
// one, otherwise the middle size by weight (so a two-size food picks the
// smaller, a three-size food the true middle). Null when there are no sizes.
export function defaultSize(sizes: UnitOption[]): UnitOption | null {
  if (sizes.length === 0) return null;
  const medium = sizes.find((s) => s.label.trim().toLowerCase() === "medium");
  if (medium) return medium;
  const byGrams = [...sizes].sort((a, b) => a.grams - b.grams);
  return byGrams[Math.floor((byGrams.length - 1) / 2)];
}

// A reference food as a food the user can add straight to a meal. It carries no
// barcode (it isn't a packaged product), and its default size becomes the unit,
// so adding it is one tap at a real portion — "1 medium croissant" — with the
// rest of its sizes riding along for the size chips.
//
// `displayName` overrides the shown name when a dry staple is swapped onto the
// reference's cooked macros but must keep the user's own product name (e.g.
// "Penne (cooked)"), so distinct staples don't collapse onto the reference.
//
// Brandless by definition, so this is also the shape a meal pick wants; the
// search box's FoodChoice is the same thing with the null brand put back on.
export function freshToPick(
  f: FreshFood,
  displayName?: string,
): Omit<FoodChoice, "brand"> {
  const size = defaultSize(f.sizes);
  const name = displayName ?? f.name;
  return {
    name,
    source: "off",
    off_barcode: null,
    kcal_100g: f.kcal_100g,
    protein_100g: f.protein_100g,
    carbs_100g: f.carbs_100g,
    fat_100g: f.fat_100g,
    fiber_100g: f.fiber_100g,
    sugar_100g: f.sugar_100g,
    satfat_100g: f.satfat_100g,
    sodium_mg_100g: f.sodium_mg_100g,
    pack_size_g: null,
    unit_g: size?.grams ?? null,
    unit_label: size ? pantryUnitLabel(name, size.label) : null,
    unit_options: f.sizes.length ? f.sizes : null,
  };
}

export function freshToChoice(f: FreshFood, displayName?: string): FoodChoice {
  return { ...freshToPick(f, displayName), brand: null };
}

// The macros a given weight of a per-100g food contributes. Kept here so the
// form and the tests compute a size's macros exactly one way.
export interface Per100 {
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

export interface UnitMacros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export function macrosForGrams(per100: Per100, grams: number): UnitMacros {
  const f = grams / 100;
  return {
    kcal: per100.kcal_100g * f,
    protein_g: per100.protein_100g * f,
    carbs_g: per100.carbs_100g * f,
    fat_g: per100.fat_100g * f,
  };
}

// A dry staple's cooked reference food, keyed by the words that name it. Every
// macro in Scoop is as-eaten, so a scanned bag of dry rice/pasta must use these
// cooked entries (see 0020) instead of the pack's dry numbers. Brown rice sits
// before white so "brown rice" wins over the bare "rice" rule below it.
const COOKED_STAPLES: { canonical: string; words: string[] }[] = [
  { canonical: "Brown Rice (cooked)", words: ["brown rice", "wholegrain rice", "whole grain rice", "wholemeal rice"] },
  { canonical: "White Rice (cooked)", words: ["white rice", "rice", "basmati", "jasmine", "long grain"] },
  {
    canonical: "Pasta (cooked)",
    words: [
      "pasta", "spaghetti", "penne", "macaroni", "fusilli", "linguine",
      "tagliatelle", "rigatoni", "farfalle", "conchiglie", "rotini", "orzo",
    ],
  },
  { canonical: "Couscous (cooked)", words: ["couscous"] },
  { canonical: "Quinoa (cooked)", words: ["quinoa"] },
  { canonical: "Porridge (cooked)", words: ["porridge", "oatmeal", "rolled oats", "oats"] },
];

// Words that mean a DIFFERENT product than the plain dry staple, so a match must
// be blocked — using cooked-rice macros for rice milk or a rice cake would be
// wrong. Better to leave these to the pack/user than to substitute badly.
const NOT_PLAIN_STAPLE = [
  "milk", "drink", "pudding", "cake", "cracker", "snack", "flour", "noodle",
  "granola", "syrup", "juice", "fried", "risotto", "pilau", "pilaf", "bar",
  "cereal", "biscuit", "bread", "wine", "vinegar", "paper",
];

// Words that say the pack is ALREADY as-eaten: a steamed pouch, a microwave rice,
// anything labelled cooked or boiled. Its label is the real cooked number for
// THAT product — usually denser than the generic reference, because a pouch is
// steamed rather than boiled — so swapping it onto the shared cooked staple
// would replace a true figure with an approximate one.
const ALREADY_COOKED = [
  "cooked", "steamed", "boiled", "precooked", "pre-cooked", "ready to heat",
  "ready-to-heat", "ready to eat", "ready-to-eat", "microwave", "microwaveable",
  "heat and eat", "heat & eat",
];

// Punctuation-insensitive words of a name: "Basmati Rice (cooked)" and
// "Ready-to-heat rice" both come out as plain spaced words to match against.
const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

// Does this product's name say it comes cooked?
export function isAlreadyCooked(productName: string): boolean {
  const n = words(productName);
  return ALREADY_COOKED.some((w) => n.includes(words(w)));
}

// Is this a bulk staple — rice, pasta, couscous, quinoa, oats — however it was
// sold? True for a dry bag AND for a steamed pouch, because the thing that makes
// a staple special is that it's served BY WEIGHT, not by a fixed serving (issue
// #27). Kept separate from the cooked-macro swap below, which only applies to
// packs whose numbers are dry.
export function isBulkStaple(productName: string): boolean {
  const n = ` ${productName.toLowerCase()} `;
  if (NOT_PLAIN_STAPLE.some((d) => new RegExp(`\\b${d}`).test(n))) return false;
  return COOKED_STAPLES.some((s) =>
    s.words.some((w) => new RegExp(`\\b${w}\\b`).test(n)),
  );
}

// Mark a food's own name cooked without losing it: "Basmati Rice" → "Basmati
// Rice (cooked)". Idempotent — an already-cooked name is returned unchanged, so
// re-adding never doubles the tag. Used when a dry staple is swapped onto the
// cooked reference's MACROS but must keep the user's product name, so distinct
// staples (penne, rigatoni, basmati) stay distinct instead of collapsing onto
// the shared "Pasta (cooked)" / "White Rice (cooked)" reference name.
export function cookedName(productName: string): string {
  const n = productName.trim();
  // Already says it: "Basmati Rice (cooked)", "Steamed Basmati", "rice, cooked".
  if (isAlreadyCooked(n)) return n;
  return `${n} (cooked)`;
}

// The cooked reference staple a scanned/typed product name should use, or null
// when it isn't a plain DRY staple. Conservative on purpose: a single
// disqualifying word (see NOT_PLAIN_STAPLE) blocks the swap, and whole-word
// matches only, so "priced" never reads as "rice".
//
// A pack that ALREADY comes cooked keeps its own label: a steamed pouch's
// numbers are the truth for that pouch, and they run denser than boiled-from-dry
// (around 32 g of carbs per 100 g against the reference's 28), so swapping them
// onto the shared reference would replace a real figure with an approximate one.
export function cookedStapleFor(productName: string): string | null {
  if (isAlreadyCooked(productName)) return null;
  const n = ` ${productName.toLowerCase()} `;
  if (NOT_PLAIN_STAPLE.some((d) => new RegExp(`\\b${d}`).test(n))) return null;
  for (const s of COOKED_STAPLES) {
    if (s.words.some((w) => new RegExp(`\\b${w}\\b`).test(n))) return s.canonical;
  }
  return null;
}
