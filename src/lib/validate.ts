import { z } from "zod";

// What a server action will accept. Anything a user types, scans or lets the AI
// guess arrives here first.
//
// These aren't form niceties — the UI already does that. They're the last line
// before a number reaches the database and starts being counted. A NaN weight, a
// negative portion or a 900 g-of-protein-per-100 g "food" doesn't fail loudly:
// it quietly poisons the day's totals, the trailing average and, through the
// weekly review, the user's calorie target.

// A macro figure per 100 g of a food. Nothing edible is negative, and nothing is
// more than 100 g of one macro per 100 g — an AI or a bad barcode record that
// claims otherwise would blow up every meal built on it.
const per100g = z.number().finite().min(0).max(100);

// Calories per 100 g. Pure fat is 900; a little headroom over that, and no more.
const kcalPer100g = z.number().finite().min(0).max(1000);

export const macrosPer100gSchema = z.object({
  kcal_100g: kcalPer100g,
  protein_100g: per100g,
  carbs_100g: per100g,
  fat_100g: per100g,
  fiber_100g: per100g.optional(),
  sugar_100g: per100g.optional(),
  satfat_100g: per100g.optional(),
  // Sodium is milligrams, and salty food is genuinely salty — pure salt is about
  // 39,000 mg of sodium per 100 g.
  sodium_mg_100g: z.number().finite().min(0).max(40_000).optional(),
});

// A weight the app will believe. Outside this it's a typo or a unit mix-up, and
// letting it in moves the trailing average that the coach adjusts calories from.
export const weightKgSchema = z.number().finite().min(20).max(500);

// A body measurement in cm.
export const measurementCmSchema = z.number().finite().min(10).max(300);

// Grams of food, eaten or planned.
export const gramsSchema = z.number().finite().positive().max(10_000);

// Grams in a planned portion — 0 is allowed here (the user dragged it to nothing
// and is about to drop it), unlike a serving actually being eaten.
export const portionGramsSchema = z.number().finite().min(0).max(10_000);

// Run a schema and throw the first problem as a plain sentence. Server actions
// surface a thrown Error to the user, so this is what they'll read.
export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length ? ` (${issue.path.join(".")})` : "";
    throw new Error(`${what}${where}: ${issue.message}`);
  }
  return result.data;
}
