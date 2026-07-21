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
// claims otherwise would blow up every meal built on it. The messages are the
// ones a user reads when a bad food is caught, so they say what's wrong in plain
// words rather than Zod's "Too big: expected number to be <=100".
const per100g = z
  .number()
  .finite()
  .min(0, "can't be negative")
  .max(100, "is over 100 g per 100 g, which isn't possible — the value looks wrong");

// Calories per 100 g. Pure fat is 900; a little headroom over that, and no more.
const kcalPer100g = z
  .number()
  .finite()
  .min(0, "can't be negative")
  .max(1000, "is more calories than any food has per 100 g — the value looks wrong");

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

// --- What we'll believe from the model --------------------------------------
//
// The AI's numbers are the least trustworthy in the app and, until now, the only
// ones with no bounds at all: the output schemas said `z.number()`, which
// accepts -400 kcal and 9000 g of protein. A hallucinated figure doesn't throw —
// it becomes a pantry item, a fixed meal in the day's budget, a food log, and
// eventually a nudge to the user's calorie target.
//
// Two checks, because they catch different lies:
//   1. bounds     — no negative food, nothing denser than food can be
//   2. coherence  — the macros have to roughly account for the calories

// The macros of one serving or one dish.
export const mealMacrosSchema = z.object({
  kcal: z.number().finite().min(0).max(5000),
  protein_g: z.number().finite().min(0).max(500),
  carbs_g: z.number().finite().min(0).max(1000),
  fat_g: z.number().finite().min(0).max(500),
});

export type MealMacros = z.infer<typeof mealMacrosSchema>;

// Atwater factors: protein and carbs are 4 kcal/g, fat is 9. Real food doesn't
// land exactly on them — fibre is counted in carbs but yields about 2 kcal/g,
// and labels round — so this is deliberately loose. It isn't here to audit a
// nutrition label; it's here to catch a number that cannot be food at all:
// "0 kcal, 60 g of protein", or 3000 kcal of thin air.
export function energyFromMacros(m: {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}): number {
  return m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
}

// How far the stated calories may sit from the macros before we stop believing
// the answer: 30%, or 100 kcal for small numbers, whichever is more forgiving.
const COHERENCE_FRACTION = 0.3;
const COHERENCE_FLOOR_KCAL = 100;

export function macrosExplainKcal(m: MealMacros): boolean {
  const implied = energyFromMacros(m);
  const slack = Math.max(COHERENCE_FLOOR_KCAL, m.kcal * COHERENCE_FRACTION);
  return Math.abs(implied - m.kcal) <= slack;
}

// A dish the model estimated: in range AND self-consistent.
export function isPlausibleMeal(m: unknown): m is MealMacros {
  const parsed = mealMacrosSchema.safeParse(m);
  return parsed.success && macrosExplainKcal(parsed.data);
}

// A food the model read off a label, a page, or a photo — per 100 g.
export function isPlausibleFood(f: unknown): boolean {
  const parsed = macrosPer100gSchema.safeParse(f);
  if (!parsed.success) return false;
  const { kcal_100g, protein_100g, carbs_100g, fat_100g } = parsed.data;

  // 100 g of food cannot contain more than 100 g of stuff. This one is physics,
  // not nutrition, and it catches a whole class of misread label.
  if (protein_100g + carbs_100g + fat_100g > 100) return false;

  return macrosExplainKcal({
    kcal: kcal_100g,
    protein_g: protein_100g,
    carbs_g: carbs_100g,
    fat_g: fat_100g,
  });
}

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
