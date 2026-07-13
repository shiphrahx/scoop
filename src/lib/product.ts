import { lookupBarcode, searchProducts, parsePackSizeG } from "@/lib/off";
import type { ParsedProduct } from "@/lib/types";

// Keyless extraction of a grocery product's per-100g nutrition from its web page
// — no AI, no key. Tried in order, most reliable first:
//   1. schema.org/Product JSON-LD `nutrition` (deterministic, when the page
//      carries it AND states a gram serving size so we can normalise to 100 g).
//   2. The page's barcode (GTIN/EAN, from JSON-LD) → Open Food Facts lookup.
//      OFF's curated per-100g macros are the same you'd get scanning the pack.
//   3. The standardised UK/EU nutrition label table, scraped from the HTML text.
//   4. Last resort: the product name → Open Food Facts full-text search.
// Each step is only accepted when it yields calories; otherwise we fall through.
// The AI reader (src/lib/ai.ts) is the final fallback when all of these miss.

type Json = Record<string, unknown>;

// Per-100g macros in the shape ParsedProduct carries (name + pack added later).
interface Per100 {
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number;
  sugar_100g: number;
  satfat_100g: number;
  sodium_mg_100g: number;
}

const ZERO: Per100 = {
  kcal_100g: 0, protein_100g: 0, carbs_100g: 0, fat_100g: 0,
  fiber_100g: 0, sugar_100g: 0, satfat_100g: 0, sodium_mg_100g: 0,
};

// First number in a value, tolerant of EU decimal commas and thousands commas.
// "1,046" → 1046 (thousands), "1,2" → 1.2 (decimal), "5.2 g" → 5.2.
function toNum(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const m = value.match(/\d[\d.,]*/);
  if (!m) return 0;
  let s = m[0];
  if (/^\d{1,3},\d{3}(?:,\d{3})*$/.test(s)) s = s.replace(/,/g, ""); // thousands
  else s = s.replace(",", "."); // decimal comma
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Minimal HTML entity decode for names pulled from meta/title tags.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .trim();
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// --- 1 & 2: schema.org/Product JSON-LD -------------------------------------

interface JsonLdProduct {
  name: string;
  gtin: string | null;
  packSizeG: number | null;
  nutrition: Per100 | null; // per 100 g, only when a gram serving size was given
}

function isProduct(node: Json): boolean {
  return asArray(node["@type"] as string | string[]).some(
    (t) => typeof t === "string" && t.toLowerCase().includes("product"),
  );
}

// Depth-first walk of a JSON-LD blob (object, array, or { @graph: [...] }).
function findProduct(data: unknown): Json | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findProduct(item);
      if (found) return found;
    }
    return null;
  }
  if (data && typeof data === "object") {
    const obj = data as Json;
    if (isProduct(obj)) return obj;
    if (obj["@graph"]) return findProduct(obj["@graph"]);
  }
  return null;
}

// A GTIN/EAN barcode from the product node — 8, 12, 13, or 14 digits.
function gtinOf(node: Json): string | null {
  for (const key of ["gtin13", "gtin", "gtin14", "gtin12", "gtin8", "ean"]) {
    const raw = node[key];
    if (raw == null) continue;
    const digits = String(raw).replace(/\D/g, "");
    if ([8, 12, 13, 14].includes(digits.length)) return digits;
  }
  return null;
}

// Pack size in grams from a node's `weight` (QuantitativeValue or string) or
// `size`. ml/L are treated as grams (close enough for food), matching off.ts.
function packOf(node: Json): number | null {
  const w = node.weight ?? node.size;
  if (w == null) return null;
  if (typeof w === "object") {
    const qv = w as Json;
    const value = toNum(qv.value);
    if (!value) return null;
    const unit = String(qv.unitText ?? qv.unitCode ?? "").toLowerCase();
    if (unit.includes("kg") || unit === "kgm") return value * 1000;
    if (unit === "g" || unit === "grm" || unit.includes("gram")) return value;
    if (unit.includes("l") || unit === "ltr") return value * 1000;
    return value; // assume grams when unit is unknown
  }
  return parsePackSizeG(String(w));
}

// schema.org NutritionInformation is per SERVING. Normalise to per 100 g using
// its servingSize; return null when we can't read a gram serving size (so the
// figures would be per an unknown amount — better to fall through than guess).
function nutritionOf(node: Json): Per100 | null {
  const n = node.nutrition as Json | undefined;
  if (!n || typeof n !== "object") return null;

  const servingG = parsePackSizeG(String(n.servingSize ?? ""));
  if (!servingG) return null;
  const f = 100 / servingG;

  const kcal = toNum(n.calories) * f;
  if (kcal <= 0) return null;
  return {
    kcal_100g: kcal,
    protein_100g: toNum(n.proteinContent) * f,
    carbs_100g: toNum(n.carbohydrateContent) * f,
    fat_100g: toNum(n.fatContent) * f,
    fiber_100g: toNum(n.fiberContent) * f,
    sugar_100g: toNum(n.sugarContent) * f,
    satfat_100g: toNum(n.saturatedFatContent) * f,
    // sodiumContent is grams → mg.
    sodium_mg_100g: Math.round(toNum(n.sodiumContent) * f * 1000),
  };
}

export function extractProductJsonLd(html: string): JsonLdProduct | null {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const m of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const node = findProduct(data);
    if (!node) continue;
    const name = typeof node.name === "string" ? decodeEntities(node.name) : "";
    return {
      name,
      gtin: gtinOf(node),
      packSizeG: packOf(node),
      nutrition: nutritionOf(node),
    };
  }
  return null;
}

// --- name fallback ----------------------------------------------------------

// The product's name from the page head: og:title, then <title>, then <h1>.
export function extractProductName(html: string): string {
  const og = html.match(
    /<meta[^>]+(?:property|name)=["']og:title["'][^>]*>/i,
  )?.[0];
  const ogContent = og?.match(/content=["']([^"']+)["']/i)?.[1];
  if (ogContent) return decodeEntities(ogContent);

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title && title.trim()) return decodeEntities(title.replace(/\s+/g, " "));

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (h1) {
    const text = decodeEntities(h1.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (text) return text;
  }
  return "";
}

// --- 3: UK/EU nutrition label table -----------------------------------------

// Grab the first number followed by `g` that appears within a short window
// after a label — the "per 100 g" column, which UK/EU labels list first.
function gramsAfter(text: string, label: RegExp): number {
  const re = new RegExp(`${label.source}[^\\d]{0,25}?(\\d[\\d.,]*)\\s*g\\b`, "i");
  const m = text.match(re);
  return m ? toNum(m[1]) : 0;
}

// Read a standardised nutrition table out of the page text. The FIC-mandated
// wording (Energy/Fat/Saturates/Carbohydrate/Sugars/Fibre/Protein/Salt) is the
// same across UK retailers, so this is retailer-agnostic. The one assumption is
// that the per-100g column comes before any per-serving column (the convention).
export function extractNutritionTable(html: string): Per100 | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

  // Energy: take the kcal figure (labels show kJ then kcal).
  const kcal = toNum(text.match(/(\d[\d.,]*)\s*kcal\b/i)?.[1]);
  if (kcal <= 0) return null;

  const fat = gramsAfter(text, /\bfat\b/);
  const carbs = gramsAfter(text, /carbohydrate/);
  const protein = gramsAfter(text, /protein/);
  // Need the core macros to trust the table — otherwise it's noise.
  if (protein <= 0 && carbs <= 0 && fat <= 0) return null;

  const salt = gramsAfter(text, /salt/);
  return {
    kcal_100g: kcal,
    protein_100g: protein,
    carbs_100g: carbs,
    fat_100g: fat,
    fiber_100g: gramsAfter(text, /fib(?:re|er)/),
    sugar_100g: gramsAfter(text, /sugars?/),
    satfat_100g: gramsAfter(text, /saturat/),
    // Labels give salt, not sodium: sodium ≈ salt / 2.5.
    sodium_mg_100g: Math.round((salt / 2.5) * 1000),
  };
}

// --- orchestration ----------------------------------------------------------

function build(name: string, m: Per100, packSizeG: number | null): ParsedProduct {
  return { name, ...m, pack_size_g: packSizeG };
}

// Run the keyless chain over a fetched page. Returns a product with per-100g
// macros when any step succeeds; a name-and-pack-only product (zero macros, for
// the user to fill in or the AI to complete) when the page names a product but
// no source had its nutrition; or null when it isn't a recognisable product.
export async function keylessProduct(html: string): Promise<ParsedProduct | null> {
  const ld = extractProductJsonLd(html);
  const name = (ld?.name || extractProductName(html)).trim();
  const pack = ld?.packSizeG ?? parsePackSizeG(name);

  // 1. JSON-LD nutrition (already normalised to per 100 g).
  if (ld?.nutrition) return build(name, ld.nutrition, pack);

  // 2. Barcode on the page → Open Food Facts.
  if (ld?.gtin) {
    const off = await lookupBarcode(ld.gtin);
    if (off && off.kcal_100g > 0) {
      return {
        name: name || off.name,
        kcal_100g: off.kcal_100g,
        protein_100g: off.protein_100g,
        carbs_100g: off.carbs_100g,
        fat_100g: off.fat_100g,
        fiber_100g: off.fiber_100g,
        sugar_100g: off.sugar_100g,
        satfat_100g: off.satfat_100g,
        sodium_mg_100g: off.sodium_mg_100g,
        pack_size_g: pack ?? off.pack_size_g,
      };
    }
  }

  // 3. Nutrition label table in the HTML.
  const table = extractNutritionTable(html);
  if (table) return build(name, table, pack);

  // 4. Product name → Open Food Facts search (fuzzy; user confirms in the form).
  if (name) {
    const [hit] = await searchProducts(name, 1);
    if (hit && hit.kcal_100g > 0) {
      return {
        name,
        kcal_100g: hit.kcal_100g,
        protein_100g: hit.protein_100g,
        carbs_100g: hit.carbs_100g,
        fat_100g: hit.fat_100g,
        fiber_100g: hit.fiber_100g,
        sugar_100g: hit.sugar_100g,
        satfat_100g: hit.satfat_100g,
        sodium_mg_100g: hit.sodium_mg_100g,
        pack_size_g: pack ?? hit.pack_size_g,
      };
    }
    // Named product, but nobody had its macros — hand back name + pack.
    return build(name, ZERO, pack);
  }

  return null;
}
