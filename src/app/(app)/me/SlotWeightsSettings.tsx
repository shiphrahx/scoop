"use client";

import { useState, useTransition } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { saveSlotWeights } from "./actions";

const STEP = 5;
const MIN = 5;
const MAX = 70;

// How big each meal is relative to the others. One row per meal slot with a
// − / + stepper; the label shows the live share of the day each meal gets, so
// the numbers always read as percentages even though the weights are relative.
export default function SlotWeightsSettings({
  slots,
  initial,
}: {
  slots: string[];
  initial: Record<string, number> | null;
}) {
  // Missing slots start at the mean of what's set (or an even 25), same rule
  // the planner applies, so what's shown is what will happen.
  const given = Object.values(initial ?? {}).filter((w) => Number.isFinite(w) && w > 0);
  const mean = given.length
    ? Math.round(given.reduce((a, b) => a + b, 0) / given.length)
    : 25;
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      slots.map((s) => {
        const w = initial?.[s];
        return [s, Number.isFinite(w) && (w as number) > 0 ? Math.round(w as number) : mean];
      }),
    ),
  );
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const total = slots.reduce((sum, s) => sum + (weights[s] ?? 0), 0);
  const dirty =
    JSON.stringify(slots.map((s) => weights[s])) !==
    JSON.stringify(
      slots.map((s) => {
        const w = initial?.[s];
        return Number.isFinite(w) && (w as number) > 0 ? Math.round(w as number) : mean;
      }),
    );

  function bump(slot: string, dir: -1 | 1) {
    setWeights((w) => ({
      ...w,
      [slot]: Math.min(MAX, Math.max(MIN, (w[slot] ?? mean) + dir * STEP)),
    }));
    setSaved(false);
  }

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveSlotWeights(weights);
      setSaved(true);
    });
  }

  return (
    <section className="flex w-full flex-col gap-4 sc-card p-5 text-left">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Meal sizes</h2>
        <p className="text-sm text-[var(--muted)]">
          How much of the day each meal gets when we plan it for you.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {slots.map((slot) => {
          const share = total > 0 ? Math.round(((weights[slot] ?? 0) / total) * 100) : 0;
          return (
            <div key={slot} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate font-medium">{slot}</span>
              <button
                onClick={() => bump(slot, -1)}
                disabled={pending || (weights[slot] ?? mean) <= MIN}
                className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90 disabled:opacity-40"
                aria-label={`Smaller ${slot}`}
              >
                <Minus size={16} />
              </button>
              <span className="w-12 text-center text-sm font-semibold tabular-nums">
                {share}%
              </span>
              <button
                onClick={() => bump(slot, 1)}
                disabled={pending || (weights[slot] ?? mean) >= MAX}
                className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90 disabled:opacity-40"
                aria-label={`Bigger ${slot}`}
              >
                <Plus size={16} />
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={save}
        disabled={pending || (!dirty && !saved)}
        className="sc-btn sc-btn-primary w-full py-3"
      >
        {pending ? (
          "Saving…"
        ) : saved && !dirty ? (
          <>
            <Check size={18} /> Saved
          </>
        ) : (
          "Save meal sizes"
        )}
      </button>
    </section>
  );
}
