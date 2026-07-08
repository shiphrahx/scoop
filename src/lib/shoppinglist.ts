import type { ImportedItem } from "@/lib/types";

// Parse a pasted shopping list or a CSV/plain-text export (Bring, AnyList,
// Google Keep, or a hand-typed list) into items + quantities. Keyless, runs in
// the browser. One item per line; quantity is optional and detected loosely.

// Lines that are clearly not items (headers, totals, list-app cruft).
const DROP = /^(total|subtotal|vat|delivery|my list|shopping list|todo)\b/i;

// A leading or trailing quantity: "2 milk", "2x milk", "milk x2", "500 g rice".
const LEAD_QTY = /^(\d+(?:\.\d+)?)\s*(?:x\b)?\s*/i;
const TRAIL_QTY = /\s+x?\s*(\d+(?:\.\d+)?)\s*$/i;
const LEAD_UNIT = /^(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl)\b\s*/i;

function cleanName(raw: string): string {
  return raw
    // Google Keep checkboxes and bullets.
    .replace(/^[-*••]\s*/, "")
    .replace(/^\[[ xX]?\]\s*/, "")
    .trim();
}

// Split one CSV/text line into a name and (optional) quantity/unit.
function parseLine(line: string): ImportedItem | null {
  // CSV: name in the first non-numeric column, quantity in any numeric column.
  if (/[,;\t]/.test(line)) {
    const cols = line.split(/[,;\t]/).map((c) => c.trim()).filter(Boolean);
    const name = cols.find((c) => !/^\d+(\.\d+)?$/.test(c));
    const qtyCol = cols.find((c) => /^\d+(\.\d+)?$/.test(c));
    if (!name) return null;
    return {
      name: cleanName(name),
      quantity: qtyCol ? Math.max(1, Math.round(Number(qtyCol))) : 1,
      unit: null,
    };
  }

  let text = cleanName(line);
  if (!text) return null;

  let quantity = 1;
  let unit: string | null = null;

  const unitM = text.match(LEAD_UNIT);
  if (unitM) {
    unit = unitM[2].toLowerCase();
    text = text.slice(unitM[0].length).trim();
  } else {
    const leadM = text.match(LEAD_QTY);
    const trailM = text.match(TRAIL_QTY);
    if (leadM) {
      quantity = Math.max(1, Math.round(Number(leadM[1])));
      text = text.slice(leadM[0].length).trim();
    } else if (trailM) {
      quantity = Math.max(1, Math.round(Number(trailM[1])));
      text = text.slice(0, trailM.index).trim();
    }
  }

  if (!text) return null;
  return { name: text, quantity, unit };
}

export function parseShoppingList(input: string): ImportedItem[] {
  const seen = new Map<string, ImportedItem>();

  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || DROP.test(trimmed)) continue;
    const item = parseLine(trimmed);
    if (!item || !item.name) continue;

    // Dedupe by lower-cased name, summing quantity.
    const key = item.name.toLowerCase();
    const existing = seen.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      seen.set(key, item);
    }
  }

  return [...seen.values()];
}
