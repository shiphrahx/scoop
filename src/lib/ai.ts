import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { safeFetchText, BlockedUrlError } from "@/lib/fetchguard";
import { extractRecipeJsonLd } from "@/lib/recipe";
import { keylessProduct } from "@/lib/product";
import type {
  DietType,
  GroceryItem,
  Macros,
  MealSuggestion,
  ParsedProduct,
  PlannedSlot,
  RecipeIngredient,
} from "@/lib/types";

// All AI runs on the user's own Anthropic key (bring-your-own-key). This module
// is server-only — the key is read here and never sent to the browser.

const MODEL = "claude-opus-4-8";

export class NoApiKeyError extends Error {
  constructor() {
    super("Connect your Anthropic key in Me to use AI features.");
    this.name = "NoApiKeyError";
  }
}

// Build a client from the signed-in user's stored key.
async function getClient(): Promise<Anthropic> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new NoApiKeyError();

  const { data } = await supabase
    .from("users")
    .select("anthropic_api_key")
    .eq("id", user.id)
    .maybeSingle();

  const stored = (data as { anthropic_api_key: string | null } | null)
    ?.anthropic_api_key;
  if (!stored) throw new NoApiKeyError();

  return new Anthropic({ apiKey: decryptSecret(stored) });
}

// Every AI feature here is the same shape: one user turn, adaptive thinking, and
// a Zod-validated structured output. This wraps that boilerplate so each caller
// only supplies its schema, system prompt, and message content.
async function parseStructured<S extends z.ZodType>(
  client: Anthropic,
  schema: S,
  system: string,
  content: Anthropic.MessageParam["content"],
  maxTokens = 4096,
): Promise<z.infer<S> | null> {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(schema) },
  });
  return res.parsed_output ?? null;
}

// --- Diet rules -------------------------------------------------------------

// Human-readable rule injected into every prompt so the model never suggests
// or keeps anything outside the user's diet.
export function dietRule(diet: DietType): string {
  if (diet === "vegan") {
    return "The user is VEGAN. Never include meat, poultry, fish, seafood, eggs, dairy, honey, or any animal product.";
  }
  if (diet === "vegetarian") {
    return "The user is VEGETARIAN. Never include meat, poultry, fish, or seafood (eggs and dairy are fine).";
  }
  if (diet === "pescatarian") {
    return "The user is PESCATARIAN. Never include meat or poultry (fish, seafood, eggs, and dairy are fine).";
  }
  if (diet === "keto") {
    return "The user is on a KETOGENIC diet. Keep carbs very low — avoid bread, pasta, rice, potatoes, grains, sugar, and sugary fruit. Favour meat, fish, eggs, cheese, non-starchy vegetables, nuts, and healthy fats.";
  }
  if (diet === "celiac") {
    return "The user has CELIAC disease. Everything must be strictly GLUTEN-FREE — never include wheat, barley, rye, malt, or ordinary bread, pasta, flour, couscous, or beer unless it is explicitly gluten-free.";
  }
  return "The user eats everything (no dietary restriction).";
}

// Belt-and-braces guard: drop anything whose text obviously breaks the diet,
// even if the model slipped up. Keyword match on name + ingredients.
const MEAT = [
  "chicken", "beef", "pork", "lamb", "bacon", "ham", "turkey", "steak",
  "sausage", "salami", "pepperoni", "prosciutto", "duck", "veal", "mince",
  "fish", "salmon", "tuna", "cod", "prawn", "shrimp", "crab", "lobster",
  "anchovy", "gelatin", "gelatine",
];
const ANIMAL = [
  ...MEAT, "egg", "milk", "cheese", "butter", "cream", "yogurt", "yoghurt",
  "honey", "whey", "casein", "ghee",
];
// Fish/seafood terms — the slice of MEAT a pescatarian is allowed to keep.
const FISH = [
  "fish", "salmon", "tuna", "cod", "prawn", "shrimp", "crab", "lobster",
  "anchovy",
];
// Obvious gluten sources for the celiac guard.
const GLUTEN = [
  "wheat", "barley", "rye", "malt", "bread", "pasta", "flour", "couscous",
  "bulgur", "semolina", "breadcrumb", "cracker", "biscuit", "pastry", "beer",
];

export function violatesDiet(text: string, diet: DietType): boolean {
  // Keto is a macro budget, not an ingredient ban — the carb target guards it.
  if (diet === "regular" || diet === "keto") return false;
  const hay = text.toLowerCase();
  const hits = (words: string[]) =>
    words.some((w) => new RegExp(`\\b${w}s?\\b`).test(hay));
  if (diet === "celiac") return hits(GLUTEN);
  if (diet === "pescatarian") return hits(MEAT.filter((w) => !FISH.includes(w)));
  return hits(diet === "vegan" ? ANIMAL : MEAT);
}

// User free text (allergies/dislikes) may contain regex metacharacters — escape
// before building a matcher.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// True when a food name matches any of the user's avoid terms (their allergies
// or their dislikes). Word-boundary and plural-tolerant, case-insensitive — so
// "peanut" flags "Crunchy Peanut Butter" but not "coconut", and "mushroom"
// catches "Chestnut Mushrooms". Blank terms are ignored.
export function matchesAvoided(name: string, terms: string[]): boolean {
  const hay = name.toLowerCase();
  return terms.some((raw) => {
    const t = raw.trim().toLowerCase();
    if (!t) return false;
    return new RegExp(`\\b${escapeRegExp(t)}s?\\b`).test(hay);
  });
}

// The one predicate the meal planner uses to decide a pantry item is fair game:
// it must break neither the diet, nor an allergy, nor a dislike. Keeps every
// "can the user eat this?" rule in one place.
export function isFoodAllowed(
  name: string,
  diet: DietType,
  allergies: string[] = [],
  dislikes: string[] = [],
): boolean {
  return (
    !violatesDiet(name, diet) &&
    !matchesAvoided(name, allergies) &&
    !matchesAvoided(name, dislikes)
  );
}

// --- Grocery screenshot → ingredient list -----------------------------------

const GrocerySchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      kcal_100g: z.number(),
      protein_100g: z.number(),
      carbs_100g: z.number(),
      fat_100g: z.number(),
    }),
  ),
});

export async function parseGroceryImage(
  base64: string,
  mediaType: "image/png" | "image/jpeg" | "image/webp",
): Promise<GroceryItem[]> {
  const client = await getClient();
  const parsed = await parseStructured(
    client,
    GrocerySchema,
    "You read grocery shopping screenshots (order confirmations, receipts, " +
      "delivery baskets) and list the food items. For each item estimate " +
      "typical macros PER 100 GRAMS from your nutrition knowledge; use 0 when " +
      "you truly cannot estimate. Skip non-food items.",
    [
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      },
      { type: "text", text: "List the food items in this screenshot." },
    ],
  );

  return parsed?.items ?? [];
}

// --- Recipe import (URL or screenshot) → parsed recipe ----------------------

const RecipeSchema = z.object({
  name: z.string(),
  servings: z.number(),
  ingredients: z.array(
    z.object({ name: z.string(), quantity: z.string() }),
  ),
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});

export interface ParsedRecipe {
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const RECIPE_SYSTEM =
  "You read a recipe and return it structured. servings is how many portions " +
  "it makes. kcal/protein_g/carbs_g/fat_g are the totals for the WHOLE recipe " +
  "(all servings combined), estimated from the ingredients. Keep each " +
  "ingredient quantity as written.";

// Strip HTML to rough text so we don't blow the context on markup.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16000);
}

export async function parseRecipeFromUrl(url: string): Promise<ParsedRecipe> {
  let html: string;
  try {
    html = await safeFetchText(url, {
      userAgent: "Scoop/0.1 recipe importer",
    });
  } catch (e) {
    // Surface a blocked/private URL as its own message; anything else is a
    // generic fetch failure.
    if (e instanceof BlockedUrlError) throw new Error(e.message);
    throw new Error("Couldn't fetch that page. Check the link.");
  }

  // Primary path: read the page's schema.org/Recipe JSON-LD. Deterministic and
  // keyless. Use it straight away when it carries nutrition.
  const structured = extractRecipeJsonLd(html);
  if (structured && structured.kcal > 0) return structured;

  // Otherwise have the model read the page text — but if the user has no key,
  // fall back to the (macro-less) structured recipe rather than failing.
  let client: Anthropic;
  try {
    client = await getClient();
  } catch (e) {
    if (structured) return structured;
    throw e;
  }

  const text = htmlToText(html);
  const parsed = await parseStructured(
    client,
    RecipeSchema,
    RECIPE_SYSTEM,
    `Read this recipe page and return the recipe.\n\n${text}`,
  );

  if (!parsed) throw new Error("Couldn't read a recipe there.");
  return parsed;
}

export async function parseRecipeFromImage(
  base64: string,
  mediaType: "image/png" | "image/jpeg" | "image/webp",
): Promise<ParsedRecipe> {
  const client = await getClient();
  const parsed = await parseStructured(client, RecipeSchema, RECIPE_SYSTEM, [
    {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: base64 },
    },
    { type: "text", text: "Read the recipe in this image." },
  ]);

  if (!parsed) throw new Error("Couldn't read a recipe there.");
  return parsed;
}

// --- Product page (shop URL) → pantry item ----------------------------------

const ProductSchema = z.object({
  name: z.string(),
  kcal_100g: z.number(),
  protein_100g: z.number(),
  carbs_100g: z.number(),
  fat_100g: z.number(),
  fiber_100g: z.number(),
  sugar_100g: z.number(),
  satfat_100g: z.number(),
  sodium_mg_100g: z.number(),
  // Grams in the whole pack, read from the product title/quantity ("500g").
  // Null when the page doesn't say.
  pack_size_g: z.number().nullable(),
});

// Read a shop product page (Tesco, Ocado, Lidl, a brand site, anywhere) into one
// pantry item. Keyless first — the page's structured data and Open Food Facts
// cover most products (see keylessProduct). AI only reads the page text when
// that finds no macros AND the user has a key; without a key we return whatever
// the keyless pass got (often name + pack size for the user to fill in).
export async function parseProductFromUrl(url: string): Promise<ParsedProduct> {
  let html: string;
  try {
    html = await safeFetchText(url, {
      userAgent: "Scoop/0.1 product importer",
    });
  } catch (e) {
    if (e instanceof BlockedUrlError) throw new Error(e.message);
    throw new Error("Couldn't fetch that page. Check the link.");
  }

  const keyless = await keylessProduct(html);
  // Good enough when we actually got calories — hand it straight back.
  if (keyless && keyless.kcal_100g > 0) return keyless;

  // No macros yet. Fall back to the model — but if the user has no key, return
  // the keyless result (name + pack size) so they can type the numbers in.
  let client: Anthropic;
  try {
    client = await getClient();
  } catch (e) {
    if (keyless && keyless.name.trim()) return keyless;
    throw e;
  }

  const text = htmlToText(html);
  const parsed = await parseStructured(
    client,
    ProductSchema,
    "You read a single grocery product's web page and return its nutrition. " +
      "name is the product's name (with brand and pack size if shown). The " +
      "macro fields are PER 100 GRAMS as printed in the nutrition table: " +
      "kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, " +
      "satfat_100g (saturated fat), sodium_mg_100g (sodium in mg — convert from " +
      "salt if only salt is given: sodium = salt_g / 2.5 × 1000). Use 0 for any " +
      "macro the page doesn't give. pack_size_g is the total grams in the pack " +
      "from the title/quantity (e.g. '500g' → 500, '1kg' → 1000), or null if " +
      "not stated. If the page isn't a food product, return name '' and zeros.",
    `Read this product page and return its nutrition.\n\n${text}`,
  );

  if (parsed && parsed.name.trim()) return parsed;
  // Model drew a blank too — fall back to the keyless name/pack if we have it.
  if (keyless && keyless.name.trim()) return keyless;
  throw new Error("Couldn't read a product there.");
}

// --- Plan a meal: dishes from pantry + diet + remaining macros --------------

const SuggestSchema = z.object({
  meals: z.array(
    z.object({
      name: z.string(),
      uses: z.array(z.string()),
      portions: z.array(z.object({ name: z.string(), grams: z.number() })),
      swaps: z.array(z.string()),
      why: z.string(),
      kcal: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
    }),
  ),
});

export interface SuggestInput {
  diet: DietType;
  allergies: string[];
  dislikes: string[];
  pantry: string[];
  remaining: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  carb?: string | null; // the carb base the user picked (optional)
  protein?: string | null; // the protein the user picked (optional)
}

export async function suggestMeals(
  input: SuggestInput,
): Promise<MealSuggestion[]> {
  const client = await getClient();

  const pick =
    input.carb || input.protein
      ? `The user chose to build the meal around ${[input.carb, input.protein]
          .filter(Boolean)
          .join(" + ")}. Center the dishes on that.\n`
      : "";

  const system =
    "You suggest simple dishes a user can make right now from what's in their " +
    "pantry, to fit the macros they have left today.\n" +
    `${dietRule(input.diet)}\n` +
    pick +
    "This diet rule is absolute: never suggest a dish that includes a " +
    "forbidden ingredient, EVEN IF that ingredient is in the pantry — skip it " +
    "entirely. Also avoid the user's allergies and dislikes. Prefer dishes " +
    "that mostly use pantry items. For each dish give EXACT portions in grams " +
    "per ingredient (the `portions` array) chosen so the dish's totals hit the " +
    "macros left today as closely as possible, plus a couple of optional " +
    "ingredient `swaps`. Keep the totals for the portions you list.";

  const parsed = await parseStructured(
    client,
    SuggestSchema,
    system,
    JSON.stringify({
      pantry: input.pantry,
      chosen_carb: input.carb ?? null,
      chosen_protein: input.protein ?? null,
      allergies: input.allergies,
      dislikes: input.dislikes,
      macros_left_today: input.remaining,
      how_many: 3,
    }),
  );

  const meals = parsed?.meals ?? [];
  // Final guard: drop anything that slipped past the diet rule.
  return meals.filter(
    (m) =>
      !violatesDiet(
        `${m.name} ${m.uses.join(" ")} ${m.portions.map((p) => p.name).join(" ")}`,
        input.diet,
      ),
  );
}

// --- Estimate macros for meals the user described in words ------------------

const EstimateSchema = z.object({
  meals: z.array(
    z.object({
      slot: z.string(),
      name: z.string(),
      kcal: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
    }),
  ),
});

export interface KnownMeal {
  slot: string;
  text: string;
}

export interface EstimatedMeal extends Macros {
  slot: string;
  name: string;
}

// The user typed what they already know they want for one or more meals (e.g.
// "porridge with banana and honey"). Estimate the macros of a single serving of
// each from nutrition knowledge, so we can fix them into the day and budget the
// rest around them. Echoes each `slot` back and tidies the name.
export async function estimateMeals(
  entries: KnownMeal[],
  diet: DietType,
): Promise<EstimatedMeal[]> {
  const clean = entries.filter((e) => e.text.trim());
  if (clean.length === 0) return [];
  const client = await getClient();

  const system =
    "You estimate the macros of meals a user has described in their own words. " +
    "For each entry, return a tidy dish `name`, echo its `slot`, and estimate " +
    "the macros of ONE serving as described: kcal, protein_g, carbs_g, fat_g. " +
    `${dietRule(diet)}\n` +
    "Estimate from typical recipes; don't refuse — give your best numeric guess.";

  const parsed = await parseStructured(
    client,
    EstimateSchema,
    system,
    JSON.stringify({
      meals: clean.map((e) => ({ slot: e.slot, description: e.text.trim() })),
    }),
    2048,
  );

  return parsed?.meals ?? [];
}

// --- Plan a whole day: fill the empty meal slots to hit the day's macros -----

const PlanDaySchema = z.object({
  meals: z.array(
    z.object({
      slot: z.string(),
      origin: z.enum(["manual", "ai"]),
      name: z.string(),
      portions: z.array(z.object({ name: z.string(), grams: z.number() })),
      swaps: z.array(z.string()),
      why: z.string(),
      kcal: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
    }),
  ),
});

export interface PlanDayInput {
  diet: DietType;
  allergies: string[];
  dislikes: string[];
  pantry: string[];
  // Macros the user should still eat today (day target minus anything already
  // logged). The empty slots we invent should fill what's left of this after
  // the meals the user has already decided.
  budget: Macros;
  // Meals the user has already built for themselves — fixed, not to be changed.
  // We only send their totals so the AI can budget around them.
  fixed: Macros;
  // The slots with no meal yet, in order — invent one dish for each.
  emptySlots: string[];
}

// Invent a pantry dish for each empty slot so the day's totals land on target.
// Meals the user already built are fixed; we just budget around their macros.
export async function planDay(input: PlanDayInput): Promise<PlannedSlot[]> {
  const client = await getClient();

  const remaining = {
    kcal: Math.max(0, Math.round(input.budget.kcal - input.fixed.kcal)),
    protein_g: Math.max(0, Math.round(input.budget.protein_g - input.fixed.protein_g)),
    carbs_g: Math.max(0, Math.round(input.budget.carbs_g - input.fixed.carbs_g)),
    fat_g: Math.max(0, Math.round(input.budget.fat_g - input.fixed.fat_g)),
  };

  const system =
    "You fill in the empty meal slots of a user's day with simple dishes they " +
    "can make from their pantry.\n" +
    `${dietRule(input.diet)}\n` +
    "This diet rule is absolute: never include a forbidden ingredient, EVEN IF " +
    "it's in the pantry. Also avoid the user's allergies and dislikes.\n" +
    "The user has already decided some meals (their macros are given as " +
    "`already_planned`). Invent ONE dish for each slot in `empty_slots`, set " +
    "origin 'ai', echo the `slot` name, and give EXACT `portions` in grams per " +
    "ingredient plus a couple of optional `swaps` and a one-line `why`. Choose " +
    "the dishes so their COMBINED macros land as close as possible to " +
    "`macros_to_fill` (what's left of the day after the decided meals). Prefer " +
    "pantry items. Return exactly one meal per empty slot, in order.";

  const parsed = await parseStructured(
    client,
    PlanDaySchema,
    system,
    JSON.stringify({
      pantry: input.pantry,
      allergies: input.allergies,
      dislikes: input.dislikes,
      already_planned: input.fixed,
      macros_to_fill: remaining,
      empty_slots: input.emptySlots,
    }),
  );

  const meals = parsed?.meals ?? [];
  // Guard the AI dishes against the diet.
  return meals.filter(
    (m) =>
      !violatesDiet(
        `${m.name} ${m.portions.map((p) => p.name).join(" ")}`,
        input.diet,
      ),
  );
}
