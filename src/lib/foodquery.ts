// The "add a food" search box: the user types the item and how much in one go
// ("50g shreddies", "rice 200 g", "medium banana"), and this pulls the two
// apart. Less typing, more tapping — but the grams it finds are multiplied
// straight into the food's macros, so getting the amount wrong here logs the
// wrong calories just as surely as bad maths would.

// Weight units we understand, in grams.
const UNIT_G: Record<string, number> = {
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
  g: 1, gram: 1, grams: 1,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000,
  ml: 1, milliliter: 1, milliliters: 1,
};
const UNIT = Object.keys(UNIT_G).join("|");

// Rough grams for size words when no exact weight is given. Food-agnostic
// guesses the user can adjust after adding.
const SIZE_G: Record<string, number> = {
  small: 80, regular: 120, medium: 120, large: 180, big: 180, jumbo: 220, xl: 220,
};
const SIZE = Object.keys(SIZE_G).join("|");

export interface FoodQuery {
  // Grams the user asked for, or null when they didn't say.
  grams: number | null;
  // What to actually search the pantry for — the amount and any size word
  // stripped out, so "50g shreddies" searches for "shreddies".
  term: string;
}

// Pull the amount out of a food query. Handles exact weights ("50g shreddies",
// "rice 200 g") and size words ("medium banana"). An explicit weight beats a
// size word when both are present.
export function parseFoodQuery(raw: string): FoodQuery {
  let s = raw.trim();

  // Strip a size word first (it isn't part of the food name) and remember its
  // default grams. An explicit weight, if also present, wins below.
  let sizeGrams: number | null = null;
  const sizeMatch = s.match(new RegExp(`(?:^|\\s)(${SIZE})(?:\\s|$)`, "i"));
  if (sizeMatch) {
    sizeGrams = SIZE_G[sizeMatch[1].toLowerCase()];
    s = s
      .replace(new RegExp(`(?:^|\\s)(${SIZE})(?:\\s|$)`, "i"), " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const lead = s.match(new RegExp(`^\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT})\\b\\s*(.+)$`, "i"));
  if (lead) return { grams: toGrams(lead[1], lead[2]), term: lead[3].trim() };

  const trail = s.match(new RegExp(`^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*(${UNIT})\\b\\s*$`, "i"));
  if (trail) return { grams: toGrams(trail[2], trail[3]), term: trail[1].trim() };

  return { grams: sizeGrams, term: s };
}

function toGrams(value: string, unit: string): number {
  const g = Number(value) * (UNIT_G[unit.toLowerCase()] ?? 1);
  return Math.max(1, Math.round(g));
}
