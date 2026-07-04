import type { OffProduct } from "@/lib/types";

// Open Food Facts lookup. Free, no key. We only need the name and the per-100g
// macros. OFF asks callers to send an identifying User-Agent.
// Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/

const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";
const USER_AGENT = "Scoop/0.1 (weight-loss coach app)";

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Look up a barcode. Returns null when the product is unknown to OFF.
export async function lookupBarcode(
  barcode: string,
): Promise<OffProduct | null> {
  const url =
    `${OFF_BASE}/${encodeURIComponent(barcode)}.json` +
    `?fields=product_name,brands,nutriments`;

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
  };
}
