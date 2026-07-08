import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type {
  DietType,
  GroceryItem,
  MealSuggestion,
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

  const key = (data as { anthropic_api_key: string | null } | null)
    ?.anthropic_api_key;
  if (!key) throw new NoApiKeyError();

  return new Anthropic({ apiKey: key });
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

export function violatesDiet(text: string, diet: DietType): boolean {
  if (diet === "regular") return false;
  const words = (diet === "vegan" ? ANIMAL : MEAT);
  const hay = text.toLowerCase();
  return words.some((w) => new RegExp(`\\b${w}s?\\b`).test(hay));
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
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system:
      "You read grocery shopping screenshots (order confirmations, receipts, " +
      "delivery baskets) and list the food items. For each item estimate " +
      "typical macros PER 100 GRAMS from your nutrition knowledge; use 0 when " +
      "you truly cannot estimate. Skip non-food items.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: "List the food items in this screenshot." },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(GrocerySchema) },
  });

  return res.parsed_output?.items ?? [];
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
  const client = await getClient();

  let text: string;
  try {
    const page = await fetch(url, {
      headers: { "User-Agent": "Scoop/0.1 recipe importer" },
    });
    if (!page.ok) throw new Error();
    text = htmlToText(await page.text());
  } catch {
    throw new Error("Couldn't fetch that page. Check the link.");
  }

  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: RECIPE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Read this recipe page and return the recipe.\n\n${text}`,
      },
    ],
    output_config: { format: zodOutputFormat(RecipeSchema) },
  });

  if (!res.parsed_output) throw new Error("Couldn't read a recipe there.");
  return res.parsed_output;
}

export async function parseRecipeFromImage(
  base64: string,
  mediaType: "image/png" | "image/jpeg" | "image/webp",
): Promise<ParsedRecipe> {
  const client = await getClient();
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: RECIPE_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: "Read the recipe in this image." },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(RecipeSchema) },
  });

  if (!res.parsed_output) throw new Error("Couldn't read a recipe there.");
  return res.parsed_output;
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

  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          pantry: input.pantry,
          chosen_carb: input.carb ?? null,
          chosen_protein: input.protein ?? null,
          allergies: input.allergies,
          dislikes: input.dislikes,
          macros_left_today: input.remaining,
          how_many: 3,
        }),
      },
    ],
    output_config: { format: zodOutputFormat(SuggestSchema) },
  });

  const meals = res.parsed_output?.meals ?? [];
  // Final guard: drop anything that slipped past the diet rule.
  return meals.filter(
    (m) =>
      !violatesDiet(
        `${m.name} ${m.uses.join(" ")} ${m.portions.map((p) => p.name).join(" ")}`,
        input.diet,
      ),
  );
}
