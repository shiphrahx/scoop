"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Pencil, Search, Trash2, X } from "lucide-react";
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
  // Inline name editor: `editing` toggles it, `draft` holds the pending name.
  editing: boolean;
  draft: string;
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
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((item) => ({
      item,
      loading: true,
      candidates: [],
      chosen: null,
      expanded: false,
      editing: false,
      draft: item.name,
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

  // Every item finished searching and none found a match. Usually the food
  // database is unreachable (a stalled request that timed out), not that every
  // item is genuinely unknown — flag it so the user isn't left guessing.
  const searchUnavailable =
    rows.length > 0 &&
    rows.every((r) => !r.loading && r.candidates.length === 0);

  const patch = (i: number, next: Partial<Row>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...next } : r)));

  // Drop a row the user doesn't want to import. Save skips it automatically.
  const remove = (i: number) =>
    setRows((prev) => prev.filter((_, j) => j !== i));

  // Rename a row and search Open Food Facts again for it, in place. The
  // corrected name is what gets saved even if OFF still finds no match.
  async function research(i: number, rawName: string) {
    const term = rawName.trim();
    if (!term) return;
    setRows((prev) =>
      prev.map((r, j) =>
        j === i
          ? { ...r, editing: false, loading: true, item: { ...r.item, name: term } }
          : r,
      ),
    );
    const found = await matchCandidates(term);
    setRows((prev) =>
      prev.map((r, j) =>
        j === i
          ? { ...r, loading: false, candidates: found, chosen: found[0] ?? null }
          : r,
      ),
    );
  }

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
        fiber_100g: r.chosen?.fiber_100g ?? 0,
        sugar_100g: r.chosen?.sugar_100g ?? 0,
        satfat_100g: r.chosen?.satfat_100g ?? 0,
        sodium_mg_100g: r.chosen?.sodium_mg_100g ?? 0,
        pack_size_g: r.chosen?.pack_size_g ?? null,
      }));
      await addMatchedItems(payload);
      onSaved();
      // Land the user on the pantry so they see what they just added.
      router.push("/pantry");
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

      {searchUnavailable && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-700">
          No matches found. The food database may be busy or offline — you can
          add these items now and set macros later, or try again in a moment.
        </p>
      )}

      {rows.length === 0 && (
        <p className="rounded-2xl bg-[var(--fill-soft)] px-4 py-6 text-center text-sm text-[var(--muted)]">
          No items left. Cancel to go back.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={i} className="rounded-2xl border border-[var(--border)] bg-white/40">
            {r.editing ? (
              <div className="flex items-center gap-2 p-3">
                <input
                  autoFocus
                  value={r.draft}
                  onChange={(e) => patch(i, { draft: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") research(i, r.draft);
                    if (e.key === "Escape")
                      patch(i, { editing: false, draft: r.item.name });
                  }}
                  placeholder="Item name"
                  className="sc-input min-w-0 flex-1"
                />
                <button
                  onClick={() => research(i, r.draft)}
                  disabled={!r.draft.trim()}
                  aria-label="Search again"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition active:scale-90 disabled:opacity-40"
                  style={{ background: "var(--grad-primary)" }}
                >
                  <Search size={17} />
                </button>
                <button
                  onClick={() => patch(i, { editing: false, draft: r.item.name })}
                  aria-label="Cancel edit"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--muted)] transition active:scale-90"
                  style={{ background: "var(--fill)" }}
                >
                  <X size={17} />
                </button>
              </div>
            ) : (
            <div className="flex items-center gap-1 pr-2">
              <button
                onClick={() => patch(i, { expanded: !r.expanded })}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
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
              <button
                onClick={() => patch(i, { editing: true, draft: r.item.name })}
                aria-label={`Edit ${r.item.name}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--muted)] transition active:scale-90"
                style={{ background: "var(--fill)" }}
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => remove(i)}
                aria-label={`Remove ${r.item.name}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--muted)] transition active:scale-90"
                style={{ background: "var(--fill)" }}
              >
                <Trash2 size={16} />
              </button>
            </div>
            )}

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
          disabled={saving || rows.length === 0 || rows.some((r) => r.loading)}
          className="sc-btn sc-btn-primary flex-1"
        >
          {saving ? "Saving…" : `Save ${rows.length} to pantry`}
        </button>
      </div>
    </section>
  );
}
