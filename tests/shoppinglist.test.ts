import { describe, expect, it } from "vitest";
import { parseShoppingList } from "@/lib/shoppinglist";

describe("parseShoppingList", () => {
  it("parses one item per line", () => {
    const items = parseShoppingList("Milk\nBread\nEggs");
    expect(items.map((i) => i.name)).toEqual(["Milk", "Bread", "Eggs"]);
  });

  it("reads a leading quantity", () => {
    expect(parseShoppingList("2 milk")[0]).toEqual({
      name: "milk",
      quantity: 2,
      unit: null,
    });
  });

  it("reads a leading 'x' quantity", () => {
    expect(parseShoppingList("2x milk")[0].quantity).toBe(2);
  });

  it("reads a trailing quantity", () => {
    expect(parseShoppingList("milk x2")[0]).toMatchObject({
      name: "milk",
      quantity: 2,
    });
  });

  it("reads a leading unit as unit, not quantity", () => {
    const item = parseShoppingList("500 g rice")[0];
    expect(item).toEqual({ name: "rice", quantity: 1, unit: "g" });
  });

  it("strips bullets and Google Keep checkboxes", () => {
    const items = parseShoppingList("- Milk\n* Bread\n[ ] Eggs\n[x] Butter");
    expect(items.map((i) => i.name)).toEqual(["Milk", "Bread", "Eggs", "Butter"]);
  });

  it("parses a CSV line: name column + numeric quantity column", () => {
    expect(parseShoppingList("Milk, 2")[0]).toEqual({
      name: "Milk",
      quantity: 2,
      unit: null,
    });
  });

  it("drops header and total lines", () => {
    const items = parseShoppingList("Shopping list\nMilk\nTotal 5");
    expect(items.map((i) => i.name)).toEqual(["Milk"]);
  });

  it("dedupes by lower-cased name, summing quantities", () => {
    const items = parseShoppingList("2 milk\nMilk");
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });

  it("ignores blank and whitespace-only lines", () => {
    expect(parseShoppingList("\n   \nMilk\n")).toHaveLength(1);
  });

  it("handles CRLF line endings", () => {
    expect(parseShoppingList("Milk\r\nBread")).toHaveLength(2);
  });

  it("clamps a fractional trailing quantity up to at least 1", () => {
    const item = parseShoppingList("milk 0.5")[0];
    expect(item.quantity).toBeGreaterThanOrEqual(1);
  });
});
