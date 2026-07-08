"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import type { Batch } from "@/lib/types";
import { deleteBatch, eatFromBatch } from "./actions";

// Existing batches. Each shows what's left in the pot and lets you log a
// serving in grams, which decrements the remaining weight.
export default function BatchList({ batches }: { batches: Batch[] }) {
  if (batches.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
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
    <li className="sc-card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{batch.name}</p>
          <p className="text-xs text-[var(--muted)]">
            {Math.round(remaining)}g left of {Math.round(total)}g ·{" "}
            {Math.round(per100)} kcal / 100g
          </p>
        </div>
        <button
          onClick={() => startTransition(() => deleteBatch(batch.id))}
          disabled={pending}
          aria-label="Delete batch"
          className="shrink-0 text-[var(--muted)] active:scale-90 disabled:opacity-40"
        >
          <X size={20} />
        </button>
      </div>

      {/* Remaining bar */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--fill)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: "var(--grad-primary)" }}
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
          className="sc-input w-28 text-lg"
        />
        <button
          disabled={pending || !grams || remaining <= 0}
          onClick={() =>
            startTransition(async () => {
              await eatFromBatch(batch.id, Number(grams));
              setGrams("");
            })
          }
          className="sc-btn sc-btn-primary flex-1"
        >
          {remaining <= 0 ? "All gone" : "Eat this"}
        </button>
      </div>
    </li>
  );
}
