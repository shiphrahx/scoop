"use client";

import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import type { ImportedItem } from "@/lib/types";
import { extractInvoiceText } from "@/lib/pdf";
import { parseInvoiceLines } from "@/lib/invoice";
import MatchItems from "./MatchItems";

// Import a PDF grocery invoice: read its text layer, parse line items, then hand
// them to the shared matcher (#6). Scanned-image PDFs (no text) are detected and
// the user is pointed at screenshot import instead. Keyless.
export default function InvoiceImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ImportedItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setNote("Reading the invoice…");
    try {
      const { lines, hasTextLayer } = await extractInvoiceText(file);
      if (!hasTextLayer) {
        setNote(
          "This looks like a scanned image. Use “Photo of your shop” below instead.",
        );
        return;
      }
      const found = parseInvoiceLines(lines);
      if (found.length === 0) {
        setNote("Couldn't read items from that PDF.");
        return;
      }
      setNote(null);
      setItems(found);
    } catch {
      setNote("Couldn't open that PDF.");
    } finally {
      setBusy(false);
    }
  }

  if (items) {
    return (
      <MatchItems
        items={items}
        onSaved={() => {
          setItems(null);
          setNote("Added to pantry.");
        }}
        onCancel={() => setItems(null)}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3 sc-card p-5">
      <h2 className="text-lg font-semibold">Import an invoice</h2>
      <p className="text-sm text-[var(--muted)]">
        A PDF from your grocery order — we&apos;ll pull out the items.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="sc-btn sc-btn-neutral py-4 text-lg"
      >
        <FileText size={20} /> {busy ? "Reading…" : "Choose a PDF"}
      </button>

      {note && (
        <p className="text-center text-sm font-medium text-[var(--muted)]">{note}</p>
      )}
    </section>
  );
}
