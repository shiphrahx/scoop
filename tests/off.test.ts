import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupBarcode, parsePackSizeG, searchProducts } from "@/lib/off";

describe("parsePackSizeG", () => {
  it("reads grams", () => {
    expect(parsePackSizeG("500 g")).toBe(500);
    expect(parsePackSizeG("450g")).toBe(450);
  });

  it("converts kilograms to grams", () => {
    expect(parsePackSizeG("1.5 kg")).toBe(1500);
  });

  it("treats litres and millilitres as grams", () => {
    expect(parsePackSizeG("1 L")).toBe(1000);
    expect(parsePackSizeG("330ml")).toBe(330);
  });

  it("converts centilitres", () => {
    expect(parsePackSizeG("33 cl")).toBe(330);
  });

  it("accepts a comma decimal", () => {
    expect(parsePackSizeG("1,5 kg")).toBe(1500);
  });

  it("returns null for non-strings", () => {
    expect(parsePackSizeG(null)).toBeNull();
    expect(parsePackSizeG(500)).toBeNull();
    expect(parsePackSizeG(undefined)).toBeNull();
  });

  it("returns null when there is no recognised unit", () => {
    expect(parsePackSizeG("one big bag")).toBeNull();
    expect(parsePackSizeG("12 pieces")).toBeNull();
  });
});

// --- Network-backed functions: fetch is mocked so tests stay offline. --------

// Build a fake fetch Response.
function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function textErrorResponse() {
  // OFF sometimes serves an HTML error page with a 200 — JSON parse throws.
  return {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchProducts", () => {
  it("returns [] for an empty query without hitting the network", async () => {
    expect(await searchProducts("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ranks a generic query and returns candidates", async () => {
    // First call: searchWithBrands (pool + facet). No implied brand.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        hits: [
          {
            code: "1",
            product_name: "Corn Flakes",
            brands: "Kellogg's",
            quantity: "500 g",
            nutriments: { "energy-kcal_100g": 378, "proteins_100g": 7 },
          },
        ],
        facets: { brands_tags: { items: [] } },
      }),
    );
    const out = await searchProducts("corn flakes");
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Corn Flakes");
    expect(out[0].kcal_100g).toBe(378);
    expect(out[0].pack_size_g).toBe(500);
  });

  it("degrades to [] when OFF serves a non-JSON error page", async () => {
    fetchMock.mockResolvedValueOnce(textErrorResponse());
    expect(await searchProducts("anything")).toEqual([]);
  });

  it("degrades to [] on a network throw", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await searchProducts("anything")).toEqual([]);
  });
});

// --- Own-brand / retailer / marketing-noise fallback ------------------------
// Real pantry names are full product titles ("M&S Red Peppers", "Ocado
// Aubergine", "Daylesford Organic Brown Onions"). The search must still find
// the base food when the brand/retailer/marketing words bury it, and must not
// land on an unrelated product that happens to share a stray token.

interface Hit {
  code: string;
  product_name: string;
  brands: string;
  quantity: string;
  nutriments: Record<string, number>;
}
const prod = (name: string, brand = ""): Hit => ({
  code: name,
  product_name: name,
  brands: brand,
  quantity: "",
  nutriments: { "energy-kcal_100g": 30, "proteins_100g": 1 },
});

type BrandItem = { key: string; name: string; count: number };

// Route every OFF request by its decoded `q`. `resolve` returns the hits (and
// optional brand-facet items) for that query; brand-size probes return 0 so no
// bogus brand is inferred.
function installOff(
  resolve: (q: string) => { hits?: Hit[]; brandItems?: BrandItem[] },
) {
  fetchMock.mockImplementation(async (url: string) => {
    const u = new URL(url);
    // Lowercase for routing — the full query keeps the user's capitals while
    // internal sub-queries are already lowercased.
    const q = (u.searchParams.get("q") ?? "").toLowerCase();
    if (q.startsWith("brands_tags:")) return jsonResponse({ count: 0 });
    const isFacet = u.searchParams.get("facets") === "brands_tags";
    const { hits = [], brandItems = [] } = resolve(q) || {};
    const body: Record<string, unknown> = { hits };
    if (isFacet) body.facets = { brands_tags: { items: brandItems } };
    return jsonResponse(body);
  });
}

const has = (q: string, ...words: string[]) => words.every((w) => q.includes(w));

describe("searchProducts — own-brand & marketing-noise fallback", () => {
  it("drops single-letter M&S tokens instead of matching M&M's (red peppers)", async () => {
    installOff((q) => {
      if (has(q, "red peppers")) return { hits: [prod("Red Peppers")] };
      // The noisy full query returns unrelated chocolate.
      if (has(q, "m&s")) return { hits: [prod("M&M's Red White & Blue")] };
      return {};
    });
    const out = await searchProducts("M&S Red Peppers");
    expect(out[0].name).toMatch(/pepper/i);
    expect(out.some((c) => /m&m/i.test(c.name))).toBe(false);
  });

  it("finds tortilla wraps, not M&M's protein peanut", async () => {
    installOff((q) => {
      if (has(q, "tortilla")) return { hits: [prod("Tortilla Wraps")] };
      if (has(q, "m&s")) return { hits: [prod("M&M's Protein Peanut")] };
      return {};
    });
    const out = await searchProducts("M&S High Protein Tortilla Wraps");
    expect(out[0].name).toMatch(/tortilla wraps/i);
  });

  it("ignores the brand and finds generic pork stir fry strips", async () => {
    installOff((q) => {
      if (has(q, "pork")) return { hits: [prod("Pork Stir-Fry Strips")] };
      return {}; // nothing under the noisy branded query
    });
    const out = await searchProducts("M&S British Outdoor Bred Pork Stir Fry Strips");
    expect(out[0].name).toMatch(/pork/i);
  });

  it("falls back past the Tenderstem trademark to broccoli", async () => {
    installOff((q) => {
      if (has(q, "tenderstem")) return {}; // no exact tenderstem product
      if (has(q, "broccoli")) return { hits: [prod("Broccoli")] };
      return {};
    });
    const out = await searchProducts("M&S Tenderstem Broccoli");
    expect(out[0].name).toMatch(/broccoli/i);
  });

  it("finds aubergine behind the Ocado retailer name", async () => {
    installOff((q) => {
      if (has(q, "ocado")) return {};
      if (has(q, "aubergine")) return { hits: [prod("Aubergine")] };
      return {};
    });
    const out = await searchProducts("Ocado Aubergine");
    expect(out[0].name).toMatch(/aubergine/i);
  });

  it("finds courgettes behind the Ocado retailer name", async () => {
    installOff((q) => {
      if (has(q, "ocado")) return {};
      if (has(q, "courgette")) return { hits: [prod("Courgettes")] };
      return {};
    });
    const out = await searchProducts("Ocado Courgettes");
    expect(out[0].name).toMatch(/courgette/i);
  });

  it("finds limes, not avocados, and strips 'twin pack'", async () => {
    installOff((q) => {
      if (has(q, "ocado")) return { hits: [prod("Avocados")] };
      if (has(q, "lime")) return { hits: [prod("Limes")] };
      return {};
    });
    const out = await searchProducts("Ocado Limes Twin Pack");
    expect(out[0].name).toMatch(/lime/i);
    expect(out.some((c) => /avocado/i.test(c.name))).toBe(false);
  });

  it("strips the Daylesford brand + 'Organic' to find brown onions", async () => {
    installOff((q) => {
      if (has(q, "daylesford")) return {};
      if (has(q, "brown", "onions")) return { hits: [prod("Brown Onions")] };
      if (has(q, "onions")) return { hits: [prod("Onions")] };
      return {};
    });
    const out = await searchProducts("Daylesford Organic Brown Onions");
    expect(out[0].name).toMatch(/onion/i);
  });

  it("finds the Alpro almond drink despite the long descriptive name", async () => {
    // The full query itself surfaces the product; two core terms (almond +
    // alpro) match, so it's accepted without needing the base noun 'drink'.
    installOff((q) => {
      if (has(q, "almond")) {
        return { hits: [prod("Alpro Almond No Sugar", "Alpro")] };
      }
      return {};
    });
    const out = await searchProducts("Alpro Almond No Sugar Long Life Dairy Free Drink");
    expect(out[0].name).toMatch(/almond/i);
  });

  it("keeps a real product brand and finds Linda McCartney shredded chicken", async () => {
    installOff((q) => {
      // In-brand constrained search returns the vegan product (check the tag
      // before the plain 'linda' facet branch, since the tag also contains it).
      if (has(q, "brands_tags:linda-mccartney")) {
        return {
          hits: [prod("Vegan Shredded Chicken", "Linda McCartney")],
        };
      }
      // Brand facet marks this as a Linda McCartney query.
      if (has(q, "linda")) {
        return {
          brandItems: [
            { key: "linda-mccartney", name: "Linda McCartney", count: 60 },
          ],
        };
      }
      return {};
    });
    const out = await searchProducts("Linda McCartney Shredded Chicken");
    expect(out[0].name).toMatch(/shredded chicken/i);
  });

  it("still returns a clean generic query directly (no needless fallback)", async () => {
    let calls = 0;
    installOff((q) => {
      calls++;
      if (has(q, "banana")) return { hits: [prod("Banana")] };
      return {};
    });
    const out = await searchProducts("banana");
    expect(out[0].name).toBe("Banana");
    // One search (+ nothing more): the primary result was already strong.
    expect(calls).toBe(1);
  });
});

describe("lookupBarcode", () => {
  it("returns a product on status 1", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 1,
        product: {
          product_name: "Baked Beans",
          brands: "Heinz",
          quantity: "415 g",
          nutriments: {
            "energy-kcal_100g": 78,
            "proteins_100g": 4.7,
            "carbohydrates_100g": 12.5,
            "fat_100g": 0.2,
          },
        },
      }),
    );
    const p = await lookupBarcode("5000157024671");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Baked Beans");
    expect(p!.kcal_100g).toBe(78);
    expect(p!.pack_size_g).toBe(415);
  });

  it("returns null on status 0 (unknown barcode)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 0 }));
    expect(await lookupBarcode("0000000000000")).toBeNull();
  });

  it("returns null on an HTTP error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 404));
    expect(await lookupBarcode("123")).toBeNull();
  });

  it("falls back to a brand name when product_name is missing", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 1,
        product: { brands: "Tesco, Finest", quantity: "1 kg", nutriments: {} },
      }),
    );
    const p = await lookupBarcode("111");
    expect(p!.name).toBe("Tesco");
    expect(p!.pack_size_g).toBe(1000);
  });

  it("coerces missing macros to 0", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 1,
        product: { product_name: "Mystery", nutriments: {} },
      }),
    );
    const p = await lookupBarcode("222");
    expect(p!.kcal_100g).toBe(0);
    expect(p!.protein_100g).toBe(0);
    expect(p!.pack_size_g).toBeNull();
  });
});
