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
