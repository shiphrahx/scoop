"use client";

import { useState, useTransition } from "react";
import type { Batch } from "@/lib/types";
import { deleteBatch, eatFromBatch } from "./actions";

// Existing batches. Each shows what's left in the pot and lets you log a
// serving in grams, which decrements the remaining weight.
export default function BatchList({ batches }: { batches: Batch[] }) {
  if (batches.length === 0) {
    return (
      <p className="text-sm text-black/40 dark:text-white/40">
        No batches yet. Cook once, log it here, eat all week.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {batches.map((b) => (
        <BatchCard key={b.id} batch={b} />
      ))}
    </ul>
  );
}

function BatchCard({ batch }: { batch: Batch }) {
  const [grams, setGrams] = useState("");
  const [pending, startTransition] = useTransition();

  const total = Number(batch.total_cooked_g) || 0;
  const remaining = Number(batch.remaining_g) || 0;
  const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;
  const per100 = total > 0 ? (Number(batch.kcal) / total) * 100 : 0;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{batch.name}</p>
          <p className="text-xs text-black/50 dark:text-white/50">
            {Math.round(remaining)}g left of {Math.round(total)}g ·{" "}
            {Math.round(per100)} kcal / 100g
          </p>
        </div>
        <button
          onClick={() => startTransition(() => deleteBatch(batch.id))}
          disabled={pending}
          aria-label="Delete batch"
          className="shrink-0 text-xl text-black/30 active:scale-90 disabled:opacity-40 dark:text-white/30"
        >
          ✕
        </button>
      </div>

      {/* Remaining bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
        <div
          className="h-full rounded-full bg-green-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
          placeholder="grams"
          className="w-28 rounded-xl border-2 border-black/10 px-3 py-2 text-lg outline-none focus:border-green-500 dark:border-white/15 dark:bg-transparent"
        />
        <button
          disabled={pending || !grams || remaining <= 0}
          onClick={() =>
            startTransition(async () => {
              await eatFromBatch(batch.id, Number(grams));
              setGrams("");
            })
          }
          className="flex-1 rounded-xl bg-green-500 px-4 py-2 font-bold text-white active:scale-95 disabled:opacity-40"
        >
          {remaining <= 0 ? "All gone" : "Eat this"}
        </button>
      </div>
    </li>
  );
}
