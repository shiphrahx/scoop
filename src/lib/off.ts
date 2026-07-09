import type { OffCandidate, OffProduct } from "@/lib/types";

// Open Food Facts lookup. Free, no key. We only need the name and the per-100g
// macros. OFF asks callers to send an identifying User-Agent.
// Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/

const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";
// Full-text search. The v2 /search endpoint ignores `search_terms` (it returns
// the whole DB by popularity), so we use the Search-a-licious API, which is
// relevance-ranked and OFF's recommended replacement for the legacy cgi search.
const OFF_SEARCH = "https://search.openfoodfacts.org/search";
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

// --- Typo tolerance --------------------------------------------------------
// OFF's search is exact (match_phrase, no fuzziness), so a misspelled item
// returns nothing. When that happens we generate likely spelling corrections
// of the query and search those, then rank the pool by how close each result
// is to what the user typed. Keyless; only runs on a miss.

// QWERTY neighbours, for "hit the wrong key" substitutions.
const KEYBOARD: Record<string, string> = {
  q: "wsa", w: "qeds", e: "wrsdf", r: "etdfg", t: "ryfgh", y: "tughj",
  u: "yijhk", i: "uokjl", o: "iplk", p: "ol", a: "qwsz", s: "awedxz",
  d: "serfcx", f: "drtgvc", g: "ftyhbv", h: "gyujnb", j: "huiknm",
  k: "jiolm", l: "kop", z: "asx", x: "zsdc", c: "xdfv", v: "cfgb",
  b: "vghn", n: "bhjm", m: "njk",
};

// Damerau–Levenshtein edit distance (with adjacent transpositions).
function damerau(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (
        i > 1 && j > 1 &&
        a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

// Edit-distance-1 spelling variants of one word: deletions, adjacent
// transpositions, letter-doublings, and keyboard-adjacent substitutions.
// Deduped and capped so a fallback fires a bounded number of searches.
function fuzzyVariants(word: string, cap = 60): string[] {
  const w = word.toLowerCase();
  const out = new Set<string>();
  for (let i = 0; i < w.length; i++) out.add(w.slice(0, i) + w.slice(i + 1));
  for (let i = 0; i < w.length - 1; i++) {
    out.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
  }
  for (let i = 0; i < w.length; i++) out.add(w.slice(0, i + 1) + w[i] + w.slice(i + 1));
  for (let i = 0; i < w.length; i++) {
    for (const c of KEYBOARD[w[i]] ?? "") {
      out.add(w.slice(0, i) + c + w.slice(i + 1));
    }
  }
  out.delete(w);
  return [...out].slice(0, cap);
}

// Similarity of a candidate's name to the search word: best (lowest-distance)
// match among the name's tokens, normalised to 0..1.
function nameSimilarity(word: string, name: string): number {
  const w = word.toLowerCase();
  let best = 0;
  for (const t of tokens(name)) {
    const sim = 1 - damerau(w, t) / Math.max(w.length, t.length, 1);
    if (sim > best) best = sim;
  }
  return best;
}

// Rank candidates by inverse document frequency within the result pool. A rare,
// distinctive query word ("vegemince") is worth far more than a common brand
// word ("linda", "mccartney") that half the pool shares — so the specific
// product wins over popular same-brand items. Weighs name + brand text; ties
// keep OFF's popularity order.
function rankByName(term: string, candidates: OffCandidate[]): OffCandidate[] {
  const want = [...new Set(tokens(term))];
  const n = candidates.length || 1;
  const texts = candidates.map(
    (c) => new Set(tokens(`${c.name} ${c.brand ?? ""}`)),
  );

  // Document frequency of each query token across the pool.
  const df: Record<string, number> = {};
  for (const w of want) {
    df[w] = texts.reduce((acc, t) => acc + (t.has(w) ? 1 : 0), 0);
  }
  const idf: Record<string, number> = {};
  for (const w of want) idf[w] = Math.log(1 + n / (df[w] || 0.5));

  // The single most distinctive query word — the one that best pins the product.
  const keyToken = want.reduce((a, b) => (idf[b] > (idf[a] ?? 0) ? b : a), want[0]);
  const maxIdf = Math.max(1, ...want.map((w) => idf[w]));

  return candidates
    .map((c, i) => {
      const t = texts[i];
      const matched = want.filter((w) => t.has(w));
      let score = matched.reduce((acc, w) => acc + idf[w], 0);
      // Prefer a tight match (little else in the text) over a long noisy one.
      // Denominator is the whole name+brand token count so a brand-side match
      // can't push the ratio above 1.
      score += 0.3 * maxIdf * (matched.length / (t.size || 1));
      // A candidate that misses the distinctive word is probably the wrong
      // product (a same-category or same-brand also-ran) — push it down hard.
      if (want.length > 1 && !t.has(keyToken)) score *= 0.2;
      return { c, score, hasMacro: c.kcal_100g > 0, i };
    })
    // Drop pure noise (matched nothing) so junk becomes "no match".
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.hasMacro) - Number(a.hasMacro) ||
        a.i - b.i,
    )
    .map((r) => r.c);
}

// The most distinctive query word given a candidate pool — the rarest one, which
// best pins the intended product. Empty string when the term has no tokens.
function distinctiveToken(term: string, pool: OffCandidate[]): string {
  const want = [...new Set(tokens(term))];
  if (want.length <= 1) return want[0] ?? "";
  const texts = pool.map((c) => new Set(tokens(`${c.name} ${c.brand ?? ""}`)));
  const n = pool.length || 1;
  const idf: Record<string, number> = {};
  for (const w of want) {
    const df = texts.reduce((acc, t) => acc + (t.has(w) ? 1 : 0), 0);
    idf[w] = Math.log(1 + n / (df || 0.5));
  }
  return want.reduce((a, b) => (idf[b] > idf[a] ? b : a), want[0]);
}

// True when the ranked results miss the query's distinctive word — a sign the
// exact search only found category/near matches and a fuzzy retry is worth it.
function exactIsWeak(term: string, ranked: OffCandidate[], pool: OffCandidate[]): boolean {
  if (!ranked.length) return true;
  if ([...new Set(tokens(term))].length < 2) return false;
  const key = distinctiveToken(term, pool);
  const top = ranked[0];
  return !new Set(tokens(`${top.name} ${top.brand ?? ""}`)).has(key);
}

// How many products carry a brand tag — used to confirm a leading-prefix brand
// is real. A two-word brand needs only a handful of products to be trusted.
const MULTIWORD_BRAND_MIN = 10;

async function brandSize(tag: string): Promise<number> {
  const url =
    `${OFF_SEARCH}?q=${encodeURIComponent(`brands_tags:${tag}`)}&page_size=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return 0;
    const body = (await res.json()) as { count?: number };
    return body.count ?? 0;
  } catch {
    return 0;
  }
}

// One OFF full-text search. Returns unranked candidates (best-effort); empty
// array on any failure so callers never block the batch.
async function rawSearch(term: string, limit: number): Promise<OffCandidate[]> {
  const q = term.trim();
  if (!q) return [];

  const url =
    `${OFF_SEARCH}?q=${encodeURIComponent(q)}` +
    `&fields=code,product_name,brands,quantity,nutriments` +
    `&page_size=${limit}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    // Search-a-licious returns matches under `hits` (relevance-ranked). OFF can
    // serve an HTML error page with a 2xx — parse inside the try so a non-JSON
    // body degrades to "no match" instead of throwing.
    const body = (await res.json()) as {
      hits?: Array<Parameters<typeof toCandidate>[0]>;
    };
    return (body.hits ?? [])
      .map(toCandidate)
      // Drop hits with no usable name.
      .filter((c) => c.name && c.name !== "Unknown item");
  } catch {
    return [];
  }
}

interface BrandFacetItem {
  key: string;
  name: string;
  count: number;
}

// One search that also returns the brand distribution of the results, so we can
// tell a brand-led query ("linda mccartney …") from a generic one ("corn flakes").
async function searchWithBrands(
  query: string,
  limit: number,
): Promise<{ pool: OffCandidate[]; brands: BrandFacetItem[] }> {
  const q = query.trim();
  if (!q) return { pool: [], brands: [] };

  const url =
    `${OFF_SEARCH}?q=${encodeURIComponent(q)}` +
    `&fields=code,product_name,brands,quantity,nutriments` +
    `&facets=brands_tags&page_size=${limit}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return { pool: [], brands: [] };
    // Parse inside the try — a non-JSON error page must degrade to empty.
    const body = (await res.json()) as {
      hits?: Array<Parameters<typeof toCandidate>[0]>;
      facets?: { brands_tags?: { items?: BrandFacetItem[] } };
    };
    const pool = (body.hits ?? [])
      .map(toCandidate)
      .filter((c) => c.name && c.name !== "Unknown item");
    return { pool, brands: body.facets?.brands_tags?.items ?? [] };
  } catch {
    return { pool: [], brands: [] };
  }
}

// A brand is "implied" when every word of its name appears in the query — then
// the user clearly wants that brand. We look at the brands present both in the
// result facet AND in the pool itself: a brand-matched product can sit mid-pool
// even when a common product word skews the facet toward other brands. Returns
// the most specific implied brand (most words, then most products), or null for
// a generic query.
// A real single-word brand is well represented in the query's results (Heinz,
// Walkers); a common word that merely coincides with some obscure brand name
// (Almond, Vegan) is not. Require this many facet products to trust a one-word
// brand — multi-word brands (Linda McCartney) are trusted regardless.
const SINGLE_WORD_BRAND_MIN = 50;

function impliedBrand(
  q: string,
  brands: BrandFacetItem[],
): { tag: string; words: string[] } | null {
  const qset = new Set(tokens(q));
  // Only trust the brand facet — its keys are canonical OFF brand tags and its
  // counts are real. (A single product's free-text brand field is often junk
  // like "Baked Beans" or "Vegan", which would gate to a bogus brand.)
  const cands = brands
    .filter((b) => b.count > 0)
    .map((b) => ({ tag: b.key, words: tokens(b.name.replace(/-/g, " ")), count: b.count }))
    .filter(
      (b) =>
        b.words.length > 0 &&
        b.words.every((w) => qset.has(w)) &&
        // Multi-word brands are safe; a one-word brand must be well represented
        // (Heinz, Walkers) to avoid gating on a common word (Vegan, Almond).
        (b.words.length >= 2 || b.count >= SINGLE_WORD_BRAND_MIN),
    );
  if (!cands.length) return null;
  cands.sort((a, b) => b.words.length - a.words.length || b.count - a.count);
  return { tag: cands[0].tag, words: cands[0].words };
}

// Search OFF by free text (an imported item name) and return up to `limit`
// candidate products, best match first, for the user to confirm.
//
// - Brand-led queries ("linda mccartney …") are constrained to that brand, so a
//   missing product returns nothing rather than other brands.
// - Generic queries rank a large pool by inverse document frequency.
// - A misspelled query with no hits falls back to a fuzzy, typo-tolerant search.
// Empty array on any failure — callers keep the item unmatched, never blocking.
export async function searchProducts(
  term: string,
  limit = 5,
): Promise<OffCandidate[]> {
  const q = term.trim();
  if (!q) return [];

  // Fetch a pool bigger than we'll show (so the idf re-rank can lift a buried
  // distinctive product) plus the brand facet (to detect a brand-led query).
  const { pool, brands } = await searchWithBrands(q, 25);
  let brand = impliedBrand(q, brands);

  // The facet can miss a brand when the product words dominate the results (e.g.
  // "linda mccartney chicken breast" — a product the brand doesn't actually make).
  // If the query leads with a real two-word brand, honour it so we stay in-brand
  // rather than leaking other brands.
  const qWords = tokens(q);
  if (!brand && qWords.length >= 3) {
    const tag = `${qWords[0]}-${qWords[1]}`;
    if ((await brandSize(tag)) >= MULTIWORD_BRAND_MIN) {
      brand = { tag, words: [qWords[0], qWords[1]] };
    }
  }

  if (brand) {
    const productWords = tokens(q).filter((w) => !brand.words.includes(w));
    const filter = `brands_tags:${brand.tag}`;
    // Each product word must AND explicitly — a bare multi-word phrase before an
    // AND filter mis-parses and returns nothing.
    const constrained = [...productWords, filter].join(" AND ");
    const inBrand = await rawSearch(constrained, 25);
    // Rank on the product words only; the brand words are shared by all hits.
    const rankTerm = productWords.length ? productWords.join(" ") : q;
    // May be empty — that means "not in this brand", never other brands.
    return rankByName(rankTerm, inBrand).slice(0, limit);
  }

  const ranked = pool.length ? rankByName(q, pool) : [];
  // Fall back to fuzzy when the exact search found nothing useful (no hits, or
  // the top hit misses the distinctive word — usually a typo).
  if (exactIsWeak(q, ranked, pool)) {
    const fz = await fuzzySearch(q, limit);
    if (fz.length) return fz;
  }
  return ranked.slice(0, limit);
}

// Fallback for a misspelled query: correct the longest word, search each
// correction, then keep the results closest to what the user typed.
async function fuzzySearch(
  q: string,
  limit: number,
): Promise<OffCandidate[]> {
  const words = q.split(/\s+/).filter(Boolean);
  // Find which words draw a blank on their own — those are the misspelled ones,
  // wherever they sit in the phrase (not necessarily the longest word).
  const solo = await Promise.all(
    words.map((w) => (w.length >= 4 ? rawSearch(w, 1) : Promise.resolve([null]))),
  );
  const failing = words.filter((w, i) => w.length >= 4 && solo[i].length === 0);
  // Correct the longest failing word; if none failed alone (the whole phrase
  // missed), fall back to the longest word. Short words rarely benefit and blow
  // up the variant count.
  const target = (failing.length ? failing : words).reduce(
    (a, b) => (b.length > a.length ? b : a),
    "",
  );
  if (target.length < 4) return [];

  const variants = fuzzyVariants(target);
  const queries = variants.map((v) =>
    words.map((w) => (w === target ? v : w)).join(" "),
  );

  const pools = await Promise.all(queries.map((query) => rawSearch(query, 3)));

  // Pool, dedupe by barcode (fall back to name for keyless hits).
  const byKey = new Map<string, OffCandidate>();
  for (const c of pools.flat()) {
    const key = c.code ?? c.name.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, c);
  }

  // Rank by closeness to the misspelled word; drop distant noise. On a near-tie
  // in similarity, prefer a candidate that actually has macros so the user gets
  // a usable match rather than an empty shell.
  const MIN_SIMILARITY = 0.6;
  return [...byKey.values()]
    .map((c) => ({ c, sim: nameSimilarity(target, c.name) }))
    .filter((r) => r.sim >= MIN_SIMILARITY)
    .sort((a, b) => {
      if (Math.abs(a.sim - b.sim) > 0.05) return b.sim - a.sim;
      const am = a.c.kcal_100g > 0 ? 1 : 0;
      const bm = b.c.kcal_100g > 0 ? 1 : 0;
      return bm - am || b.sim - a.sim;
    })
    .slice(0, limit)
    .map((r) => r.c);
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
