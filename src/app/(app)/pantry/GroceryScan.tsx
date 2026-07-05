"use client";

import { useRef, useState } from "react";
import { readImageFile } from "@/lib/image";
import type { GroceryItem } from "@/lib/types";
import { addGroceryItems, scanGroceries } from "./actions";

// Take a photo / pick a screenshot of groceries → AI reads the items → user
// ticks the ones to keep → they land in the pantry.
export default function GroceryScan() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<GroceryItem[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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

  async function addChosen() {
    if (!items) return;
    setBusy(true);
    try {
      await addGroceryItems(items.filter((_, i) => chosen.has(i)));
      setItems(null);
      setChosen(new Set());
      setNote(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 sc-card p-5">
      <h2 className="text-lg font-bold">Scan groceries</h2>

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
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-2xl border-2 border-green-500 px-6 py-4 text-lg font-bold text-green-600 active:scale-95 disabled:opacity-50 dark:text-green-400"
      >
        <span className="text-2xl">🧾</span>
        {busy && !items ? "Reading…" : "Photo of your shop"}
      </button>

      {note && (
        <p className="text-center text-sm font-medium text-black/60 dark:text-white/60">
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
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left active:scale-[0.99] ${
                    chosen.has(i)
                      ? "border-green-500 bg-green-500/10"
                      : "border-black/10"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {it.name}
                    </span>
                    <span className="text-xs text-black/50 dark:text-white/50">
                      {Math.round(it.kcal_100g)} kcal / 100g
                    </span>
                  </span>
                  <span className="text-lg">{chosen.has(i) ? "✅" : "⬜"}</span>
                </button>
              </li>
            ))}
          </ul>

          <button
            onClick={addChosen}
            disabled={busy || chosen.size === 0}
            className="w-full sc-btn sc-btn-primary py-4 text-lg"
          >
            {busy ? "Adding…" : `Add ${chosen.size} to pantry`}
          </button>
        </>
      )}
    </section>
  );
}
