// Client-side PDF text extraction for grocery-invoice import (#3). Runs in the
// browser so invoice data never leaves the device before the user confirms.
// pdf.js is loaded lazily (dynamic import) to keep it out of the initial bundle.

// Reconstruct lines from a page's text items by grouping on their y-position.
function itemsToLines(
  items: { str: string; transform: number[] }[],
): string[] {
  const rows = new Map<number, { x: number; str: string }[]>();
  for (const it of items) {
    if (!it.str) continue;
    const y = Math.round(it.transform[5]); // vertical position
    const x = it.transform[4];
    // Bucket to the nearest 2px so wobbles on the same visual row group together.
    const key = Math.round(y / 2) * 2;
    (rows.get(key) ?? rows.set(key, []).get(key)!).push({ x, str: it.str });
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // top of page first
    .map(([, cells]) =>
      cells
        .sort((a, b) => a.x - b.x)
        .map((c) => c.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

export interface PdfExtract {
  lines: string[];
  hasTextLayer: boolean;
}

// Read a PDF's text layer into lines. hasTextLayer is false for scanned-image
// PDFs (no extractable text) — the caller then routes to screenshot import.
export async function extractInvoiceText(file: File): Promise<PdfExtract> {
  const pdfjs = await import("pdfjs-dist");
  // Bundle the worker as a same-origin asset (no external CDN — CSP/offline safe).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  const lines: string[] = [];
  const maxPages = Math.min(doc.numPages, 20);
  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as { str: string; transform: number[] }[];
    lines.push(...itemsToLines(items));
  }

  const textLength = lines.join("").replace(/\s/g, "").length;
  return { lines, hasTextLayer: textLength > 20 };
}
