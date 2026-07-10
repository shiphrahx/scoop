"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ReceiptText, Check, Square, KeyRound } from "lucide-react";
import { readImageFile } from "@/lib/image";
import type { GroceryItem, ImportedItem, OffCandidate } from "@/lib/types";
import { scanGroceries } from "./actions";
import MatchItems from "./MatchItems";

// Take a photo / pick a screenshot of groceries → AI reads the items → user
// ticks the ones to keep → they land in the pantry. This is the ONLY pantry
// import that needs the user's own key, so the key prompt lives here — barcode,
// manual, and file imports all work without one.
export default function GroceryScan({ connected }: { connected: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<GroceryItem[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Once the user confirms which items to keep, hand them to the shared matcher
  // to resolve macros from Open Food Facts (the model's estimate is the fallback).
  const [matching, setMatching] = useState<{
    items: ImportedItem[];
    fallbacks: (OffCandidate | null)[];
  } | null>(null);

  async function onPick(file: File) {
    setNote("Reading your groceries…");
    setBusy(true);
    try {
      const { base64, mediaType } = await readImageFile(file);
      const found = await scanGroceries(base64, mediaType);
      setItems(found);
      setChosen(new Set(found.map((_, i) => i)));
      setNote(
        found.length ? "Tick the ones to add." : "No food items spotted.",
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(i: number) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function confirmChosen() {
    if (!items) return;
    const picked = items.filter((_, i) => chosen.has(i));
    setMatching({
      items: picked.map((it) => ({ name: it.name, quantity: 1, unit: null })),
      // The model's per-100g estimate, used only if OFF finds no match.
      fallbacks: picked.map((it) => ({
        code: null,
        name: it.name,
        brand: "estimated",
        kcal_100g: it.kcal_100g,
        protein_100g: it.protein_100g,
        carbs_100g: it.carbs_100g,
        fat_100g: it.fat_100g,
        fiber_100g: 0,
        sugar_100g: 0,
        satfat_100g: 0,
        sodium_mg_100g: 0,
        pack_size_g: null,
      })),
    });
    setItems(null);
    setChosen(new Set());
    setNote(null);
  }

  if (matching) {
    return (
      <MatchItems
        items={matching.items}
        fallbacks={matching.fallbacks}
        onSaved={() => {
          setMatching(null);
          setNote("Added to pantry.");
        }}
        onCancel={() => setMatching(null)}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3 sc-card p-5">
      <h2 className="text-lg font-semibold">Scan groceries</h2>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />

      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy || !connected}
        className="sc-btn sc-btn-soft py-4 text-lg"
      >
        <ReceiptText size={22} />
        {busy && !items ? "Reading…" : "Photo of your shop"}
      </button>

      {!connected && (
        <Link
          href="/me"
          className="flex items-center justify-center gap-1.5 text-center text-sm text-[var(--muted)]"
        >
          <KeyRound size={14} /> Connect your key to read a photo of your shop.
        </Link>
      )}

      {note && (
        <p className="text-center text-sm font-medium text-[var(--muted)]">
          {note}
        </p>
      )}

      {items && items.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((it, i) => (
              <li key={i}>
                <button
                  onClick={() => toggle(i)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99] ${
                    chosen.has(i)
                      ? "border-transparent"
                      : "border-[var(--border)] bg-white/40"
                  }`}
                  style={
                    chosen.has(i)
                      ? { background: "var(--tint-teal)" }
                      : undefined
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {it.name}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {Math.round(it.kcal_100g)} kcal / 100g
                    </span>
                  </span>
                  {chosen.has(i) ? (
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white"
                      style={{ background: "var(--grad-primary)" }}
                    >
                      <Check size={15} strokeWidth={3} />
                    </span>
                  ) : (
                    <Square size={22} className="shrink-0 text-[var(--muted)]" />
                  )}
                </button>
              </li>
            ))}
          </ul>

          <button
            onClick={confirmChosen}
            disabled={busy || chosen.size === 0}
            className="w-full sc-btn sc-btn-primary py-4 text-lg"
          >
            {`Match ${chosen.size} to foods`}
          </button>
        </>
      )}
    </section>
  );
}
