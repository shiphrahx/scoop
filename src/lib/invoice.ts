import type { ImportedItem } from "@/lib/types";

// Turn the text lines of a UK grocery invoice/order (Tesco, Sainsbury's, Ocado)
// into items + quantities. Layout-tolerant: strip prices and quantities, drop
// non-item lines. Deliberately generous — the user confirms everything in the
// matcher (#6), so a stray line is cheaper than a dropped item.

// Non-item lines: totals, fees, headers, payment, addresses.
const DROP =
  /\b(total|subtotal|sub-total|vat|delivery|service|charge|order|invoice|receipt|payment|card|change|balance|savings?|clubcard|nectar|voucher|discount|basket|substitut|refund|thank you|www\.|\.com|@)\b/i;

// A money amount like "£1.20", "1.20", "2.50 A".
const PRICE = /£?\s*\d+\.\d{2}\b/g;
// Leading quantity: "2 ", "2 x ", "2x ".
const LEAD_QTY = /^(\d+)\s*(?:x\b)?\s*/i;
// Weight line: "0.450 kg", "450g".
const WEIGHT = /\b\d+(?:\.\d+)?\s*(kg|g)\b/i;

function looksLikeItem(name: string): boolean {
  // Needs at least a couple of letters; reject pure numbers / codes.
  const letters = (name.match(/[a-z]/gi) ?? []).length;
  return letters >= 2 && name.length >= 2;
}

export function parseInvoiceLines(lines: string[]): ImportedItem[] {
  const items: ImportedItem[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || DROP.test(line)) continue;

    // Skip lines that are only a price / number.
    if (/^£?\s*\d+(\.\d+)?\s*[a-zA-Z]?$/.test(line)) continue;

    const weightM = line.match(WEIGHT);
    const unit = weightM ? weightM[1].toLowerCase() : null;

    // Strip prices and any trailing weight token, then a leading quantity.
    let name = line.replace(PRICE, " ").replace(/\s+/g, " ").trim();
    let quantity = 1;
    const qtyM = name.match(LEAD_QTY);
    if (qtyM && qtyM[1]) {
      // Only treat a leading number as quantity if something remains after it.
      const rest = name.slice(qtyM[0].length).trim();
      if (looksLikeItem(rest)) {
        quantity = Math.max(1, parseInt(qtyM[1], 10));
        name = rest;
      }
    }

    // Drop a trailing weight/price residue so the name is clean.
    name = name.replace(WEIGHT, "").replace(/[£•]/g, "").replace(/\s+/g, " ").trim();

    if (!looksLikeItem(name)) continue;
    items.push({ name, quantity, unit });
  }

  // Dedupe by lower-cased name, summing quantity.
  const seen = new Map<string, ImportedItem>();
  for (const it of items) {
    const key = it.name.toLowerCase();
    const existing = seen.get(key);
    if (existing) existing.quantity += it.quantity;
    else seen.set(key, { ...it });
  }
  return [...seen.values()];
}
