import type { OffCandidate, OffProduct } from "@/lib/types";

// Open Food Facts lookup. Free, no key. We only need the name and the per-100g
// macros. OFF asks callers to send an identifying User-Agent.
// Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/

const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";
const OFF_SEARCH = "https://world.openfoodfacts.org/api/v2/search";
const USER_AGENT = "Scoop/0.1 (weight-loss coach app)";

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Turn an OFF "quantity" string into grams. Handles "500 g", "1.5 kg", "1 L"
// (treat ml/L as grams, close enough for food), "330ml". Null when unparseable.
export function parsePackSizeG(quantity: unknown): number | null {
  if (typeof quantity !== "string") return null;
  const m = quantity
    .toLowerCase()
    .replace(",", ".")
    .match(/([\d.]+)\s*(kg|g|l|ml|cl)\b/);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  switch (m[2]) {
    case "kg":
      return value * 1000;
    case "l":
      return value * 1000;
    case "cl":
      return value * 10;
    case "ml":
    case "g":
    default:
      return value;
  }
}

// Shape one OFF product record into per-100g macros + pack size. `brands` comes
// back as a comma-joined string from the product/v2 APIs but as an array from
// the Search-a-licious search API — accept either and take the first brand.
function toCandidate(p: {
  code?: string;
  product_name?: string;
  brands?: string | string[];
  quantity?: string;
  nutriments?: Record<string, unknown>;
}): OffCandidate {
  const n = p.nutriments ?? {};
  const brandList = Array.isArray(p.brands)
    ? p.brands
    : p.brands
      ? p.brands.split(",")
      : [];
  const brand = brandList.length ? brandList[0].trim() : null;
  const name = (p.product_name && p.product_name.trim()) || brand || "Unknown item";
  return {
    code: p.code ?? null,
    name,
    brand,
    kcal_100g: num(n["energy-kcal_100g"]),
    protein_100g: num(n["proteins_100g"]),
    carbs_100g: num(n["carbohydrates_100g"]),
    fat_100g: num(n["fat_100g"]),
    pack_size_g: parsePackSizeG(p.quantity),
  };
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Rank candidates by how much their name overlaps the search term. Simple
// token-overlap score; ties keep OFF's popularity order.
function rankByName(term: string, candidates: OffCandidate[]): OffCandidate[] {
  const want = new Set(tokens(term));
  return candidates
    .map((c, i) => {
      const hits = tokens(c.name).filter((t) => want.has(t)).length;
      return { c, score: hits / Math.max(1, want.size), i };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.c);
}

// Search OFF by free text (an imported item name) and return up to `limit`
// candidate products, best match first, for the user to confirm. Empty array on
// any failure — callers keep the item unmatched rather than blocking the batch.
export async function searchProducts(
  term: string,
  limit = 5,
): Promise<OffCandidate[]> {
  const q = term.trim();
  if (!q) return [];

  const url =
    `${OFF_SEARCH}?search_terms=${encodeURIComponent(q)}` +
    `&fields=code,product_name,brands,quantity,nutriments` +
    `&page_size=${limit}&sort_by=popularity_key`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 86400 },
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const body = (await res.json()) as {
    products?: Array<Parameters<typeof toCandidate>[0]>;
  };
  const candidates = (body.products ?? [])
    .map(toCandidate)
    // Drop hits with no usable name.
    .filter((c) => c.name && c.name !== "Unknown item");
  return rankByName(q, candidates);
}

// Look up a barcode. Returns null when the product is unknown to OFF.
export async function lookupBarcode(
  barcode: string,
): Promise<OffProduct | null> {
  const url =
    `${OFF_BASE}/${encodeURIComponent(barcode)}.json` +
    `?fields=product_name,brands,quantity,nutriments`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    // OFF data changes rarely; let Next cache it for a day.
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    status?: number;
    product?: {
      product_name?: string;
      brands?: string;
      quantity?: string;
      nutriments?: Record<string, unknown>;
    };
  };

  // status 1 = found, 0 = not found.
  if (body.status !== 1 || !body.product) return null;

  const p = body.product;
  const n = p.nutriments ?? {};
  const name =
    (p.product_name && p.product_name.trim()) ||
    (p.brands && p.brands.split(",")[0].trim()) ||
    `Item ${barcode}`;

  return {
    barcode,
    name,
    kcal_100g: num(n["energy-kcal_100g"]),
    protein_100g: num(n["proteins_100g"]),
    carbs_100g: num(n["carbohydrates_100g"]),
    fat_100g: num(n["fat_100g"]),
    pack_size_g: parsePackSizeG(p.quantity),
  };
}
