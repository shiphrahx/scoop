import { describe, expect, it } from "vitest";
import { parseInvoiceLines } from "@/lib/invoice";

describe("parseInvoiceLines", () => {
  it("extracts a plain item and strips the price", () => {
    const items = parseInvoiceLines(["Semi Skimmed Milk £1.20"]);
    expect(items).toEqual([{ name: "Semi Skimmed Milk", quantity: 1, unit: null }]);
  });

  it("reads a leading quantity", () => {
    const items = parseInvoiceLines(["2 x Baked Beans £0.90"]);
    expect(items[0]).toEqual({ name: "Baked Beans", quantity: 2, unit: null });
  });

  it("captures a weight unit and strips the weight from the name", () => {
    const items = parseInvoiceLines(["Bananas Loose 0.450 kg £0.65"]);
    expect(items[0].unit).toBe("kg");
    expect(items[0].name).not.toMatch(/0\.450/);
    expect(items[0].name).toMatch(/Bananas/);
  });

  it("drops totals, VAT, delivery and other non-item lines", () => {
    const items = parseInvoiceLines([
      "Total £34.20",
      "Subtotal £30.00",
      "VAT £4.20",
      "Delivery £3.50",
      "Clubcard savings £2.00",
      "Cheddar Cheese £2.50",
    ]);
    expect(items.map((i) => i.name)).toEqual(["Cheddar Cheese"]);
  });

  it("drops lines that are only a price or number", () => {
    expect(parseInvoiceLines(["£4.20", "12", "2.50 A"])).toEqual([]);
  });

  it("drops URLs and emails", () => {
    expect(parseInvoiceLines(["www.tesco.com", "help@ocado.com"])).toEqual([]);
  });

  it("dedupes by lower-cased name, summing quantities", () => {
    const items = parseInvoiceLines(["2 Eggs £1.00", "eggs £1.00"]);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });

  it("does not treat a leading number as quantity when nothing follows", () => {
    // "500 g" alone is a weight line, not "500 of g" — reject as non-item.
    expect(parseInvoiceLines(["500 g"])).toEqual([]);
  });

  it("ignores blank lines", () => {
    expect(parseInvoiceLines(["", "   ", "Rice £1.00"])).toHaveLength(1);
  });

  it("keeps quantity at least 1", () => {
    const items = parseInvoiceLines(["0 Apples £2.00"]);
    // 0 is parsed then clamped up to 1 (or the 0 is ignored as a leading token)
    expect(items[0].quantity).toBeGreaterThanOrEqual(1);
  });
});
