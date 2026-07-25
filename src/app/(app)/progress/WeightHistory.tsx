"use client";

import { useState } from "react";
import { Scale } from "lucide-react";

const PAGE = 14;

// The full daily-weigh-in history, newest first, revealed a page at a time so a
// long history doesn't render hundreds of rows at once. View-only.
export default function WeightHistory({
  weights,
}: {
  weights: { date: string; weight_kg: number }[];
}) {
  const sorted = [...weights].sort((a, b) => b.date.localeCompare(a.date));
  const [shown, setShown] = useState(PAGE);

  if (sorted.length === 0) {
    return (
      <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
        <Scale size={22} className="text-[var(--muted)]" />
        <p className="text-sm text-[var(--muted)]">No weigh-ins yet.</p>
      </div>
    );
  }

  const visible = sorted.slice(0, shown);

  return (
    <div className="flex flex-col gap-3">
      <ul className="sc-card flex flex-col divide-y divide-[var(--border)] p-2">
        {visible.map((w, i) => {
          const prev = visible[i + 1];
          const delta = prev ? w.weight_kg - prev.weight_kg : null;
          return (
            <li
              key={w.date}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="text-[var(--muted)]">{w.date}</span>
              <span className="flex items-center gap-3">
                {delta != null && delta !== 0 && (
                  <span
                    className="text-xs tabular-nums"
                    style={{
                      color: delta < 0 ? "var(--ink-green)" : "var(--accent)",
                    }}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(1)}
                  </span>
                )}
                <span className="font-semibold tabular-nums text-[var(--foreground)]">
                  {w.weight_kg.toFixed(1)} kg
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {shown < sorted.length && (
        <button
          onClick={() => setShown((s) => s + PAGE)}
          className="sc-btn sc-btn-neutral w-full"
        >
          Show more ({sorted.length - shown} left)
        </button>
      )}
    </div>
  );
}
