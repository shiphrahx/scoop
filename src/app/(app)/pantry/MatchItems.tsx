"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import type { ImportedItem, OffCandidate } from "@/lib/types";
import { addMatchedItems, matchCandidates, type PantryInput } from "./actions";

// Shared final step for every non-barcode import (PDF #3, list #4, screenshot
// #5): for each parsed item, search Open Food Facts, show the best match to
// confirm in one tap, let the user swap to an alternate or keep it unmatched,
// then save the batch with the chosen macros + pack size. No key needed.

type Row = {
  item: ImportedItem;
  loading: boolean;
  candidates: OffCandidate[];
  // The accepted match, or null = "keep, no macros yet".
  chosen: OffCandidate | null;
  expanded: boolean;
};

export default function MatchItems({
  items,
  fallbacks,
  onSaved,
  onCancel,
}: {
  items: ImportedItem[];
  // Optional per-item macro estimate (aligned by index) used when Open Food
  // Facts has no match — e.g. the vision model's guess from a screenshot (#5).
  fallbacks?: (OffCandidate | null)[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((item) => ({
      item,
      loading: true,
      candidates: [],
      chosen: null,
      expanded: false,
    })),
  );
  const [saving, setSaving] = useState(false);

  // Fetch candidates for every item once, in parallel.
  useEffect(() => {
    let live = true;
    Promise.all(items.map((it) => matchCandidates(it.name))).then((all) => {
      if (!live) return;
      setRows((prev) =>
        prev.map((r, i) => {
          // Offer OFF hits plus the estimate (if any) as a selectable option.
          const fb = fallbacks?.[i] ?? null;
          const candidates = fb ? [...all[i], fb] : all[i];
          return {
            ...r,
            loading: false,
            candidates,
            // Prefer a real OFF match; otherwise fall back to the estimate.
            chosen: all[i][0] ?? fb,
          };
        }),
      );
    });
    return () => {
      live = false;
    };
  }, [items, fallbacks]);

  const patch = (i: number, next: Partial<Row>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...next } : r)));

  async function save() {
    setSaving(true);
    try {
      const payload: PantryInput[] = rows.map((r) => ({
        name: r.chosen?.name ?? r.item.name,
        off_barcode: r.chosen?.code ?? null,
        quantity: r.item.quantity,
        kcal_100g: r.chosen?.kcal_100g ?? 0,
        protein_100g: r.chosen?.protein_100g ?? 0,
        carbs_100g: r.chosen?.carbs_100g ?? 0,
        fat_100g: r.chosen?.fat_100g ?? 0,
        pack_size_g: r.chosen?.pack_size_g ?? null,
      }));
      await addMatchedItems(payload);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 sc-card p-5">
      <h2 className="text-lg font-semibold">Confirm your items</h2>
      <p className="text-sm text-[var(--muted)]">
        Tap a row to pick a different match, or keep it as-is and add macros
        later.
      </p>

      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={i} className="rounded-2xl border border-[var(--border)] bg-white/40">
            <button
              onClick={() => patch(i, { expanded: !r.expanded })}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {r.item.name}
                  {r.item.quantity > 1 && (
                    <span className="text-[var(--muted)]"> ×{r.item.quantity}</span>
                  )}
                </span>
                <span className="block truncate text-xs text-[var(--muted)]">
                  {r.loading ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" /> Searching…
                    </span>
                  ) : r.chosen ? (
                    `${r.chosen.name}${r.chosen.brand ? ` · ${r.chosen.brand}` : ""} · ${Math.round(
                      r.chosen.kcal_100g,
                    )} kcal/100g`
                  ) : (
                    "No match — will add without macros"
                  )}
                </span>
              </span>
              <ChevronDown
                size={18}
                className={`shrink-0 text-[var(--muted)] transition ${
                  r.expanded ? "rotate-180" : ""
                }`}
              />
            </button>

            {r.expanded && !r.loading && (
              <div className="flex flex-col gap-1.5 px-4 pb-3">
                {r.candidates.map((c, ci) => (
                  <button
                    key={ci}
                    onClick={() => patch(i, { chosen: c })}
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm"
                    style={
                      r.chosen === c
                        ? { background: "var(--tint-teal)" }
                        : { background: "var(--fill-soft)" }
                    }
                  >
                    <span className="min-w-0 truncate">
                      {c.name}
                      {c.brand ? (
                        <span className="text-[var(--muted)]"> · {c.brand}</span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-[var(--muted)]">
                      {Math.round(c.kcal_100g)} kcal
                      {r.chosen === c && (
                        <Check size={14} className="text-[var(--ink-teal)]" />
                      )}
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => patch(i, { chosen: null })}
                  className="rounded-xl px-3 py-2 text-left text-sm"
                  style={
                    r.chosen === null
                      ? { background: "var(--tint-teal)" }
                      : { background: "var(--fill-soft)" }
                  }
                >
                  None of these — add without macros
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="sc-btn sc-btn-neutral flex-1"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving || rows.some((r) => r.loading)}
          className="sc-btn sc-btn-primary flex-1"
        >
          {saving ? "Saving…" : `Save ${rows.length} to pantry`}
        </button>
      </div>
    </section>
  );
}
