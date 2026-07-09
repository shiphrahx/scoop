"use client";

import { useState, useTransition } from "react";
import { Sparkles, Check, X, Plus } from "lucide-react";
import type { Macros, PlannedMeal } from "@/lib/types";
import { pinMeal, clearSlot, planMyDay, logPlannedMeal } from "./actions";

type Slot = { slot: string; meal: PlannedMeal | null };

// Sum the macros of every meal in the plan (pinned estimates + AI dishes).
function planned(slots: Slot[]): Macros {
  return slots.reduce<Macros>(
    (s, { meal }) =>
      meal
        ? {
            kcal: s.kcal + meal.kcal,
            protein_g: s.protein_g + meal.protein_g,
            carbs_g: s.carbs_g + meal.carbs_g,
            fat_g: s.fat_g + meal.fat_g,
          }
        : s,
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

export default function DayPlan({
  slots,
  target,
  connected,
}: {
  slots: Slot[];
  target: Macros | null;
  connected: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const total = planned(slots);
  const anyEmpty = slots.some((s) => !s.meal);
  const anyPending = slots.some((s) => s.meal && s.meal.kcal === 0);

  function run(fn: () => Promise<void>) {
    setErr(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Day totals: what the plan adds up to vs the target. */}
      {target && (
        <div className="sc-card flex items-center justify-around gap-2 p-4 text-center">
          <Stat label="kcal" value={total.kcal} of={target.kcal} />
          <Stat label="P" value={total.protein_g} of={target.protein_g} />
          <Stat label="C" value={total.carbs_g} of={target.carbs_g} />
          <Stat label="F" value={total.fat_g} of={target.fat_g} />
        </div>
      )}

      {slots.map(({ slot, meal }) => (
        <div key={slot} className="sc-card flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {slot}
            </span>
            {meal && !meal.logged_food_id && (
              <button
                onClick={() => run(() => clearSlot(slot))}
                disabled={busy}
                className="text-[var(--muted)] transition active:scale-90"
                aria-label={`Clear ${slot}`}
              >
                <X size={18} />
              </button>
            )}
          </div>

          {!meal && (
            <div className="flex gap-2">
              <input
                value={drafts[slot] ?? ""}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [slot]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (drafts[slot] ?? "").trim()) {
                    run(() => pinMeal(slot, drafts[slot]));
                    setDrafts((d) => ({ ...d, [slot]: "" }));
                  }
                }}
                placeholder="Something you'll eat… (or leave for me)"
                className="sc-input flex-1"
              />
              <button
                onClick={() => {
                  run(() => pinMeal(slot, drafts[slot] ?? ""));
                  setDrafts((d) => ({ ...d, [slot]: "" }));
                }}
                disabled={busy || !(drafts[slot] ?? "").trim()}
                className="sc-btn sc-btn-soft shrink-0 px-4"
                aria-label={`Pin ${slot}`}
              >
                <Plus size={18} />
              </button>
            </div>
          )}

          {meal && (
            <>
              <p className="text-lg font-semibold">{meal.name}</p>

              {meal.portions.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-2xl bg-[var(--fill-soft)] p-3 text-sm">
                  {meal.portions.map((p, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {Math.round(p.grams)} g
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {meal.why && (
                <p className="text-sm text-[var(--muted)]">{meal.why}</p>
              )}
              {meal.swaps.length > 0 && (
                <p className="text-xs text-[var(--muted)]">
                  Swaps: {meal.swaps.join(" · ")}
                </p>
              )}

              {meal.kcal > 0 ? (
                <p className="text-xs text-[var(--muted)]">
                  {Math.round(meal.kcal)} kcal · P{Math.round(meal.protein_g)} C
                  {Math.round(meal.carbs_g)} F{Math.round(meal.fat_g)}
                </p>
              ) : (
                <p className="text-xs text-[var(--muted)]">
                  Macros filled in when you plan the day.
                </p>
              )}

              {meal.logged_food_id ? (
                <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-teal)]">
                  <Check size={16} /> Eaten
                </p>
              ) : (
                meal.kcal > 0 && (
                  <button
                    onClick={() => run(() => logPlannedMeal(meal.id))}
                    disabled={busy}
                    className="sc-btn sc-btn-soft mt-1"
                  >
                    I ate this — log it
                  </button>
                )
              )}
            </>
          )}
        </div>
      ))}

      {err && (
        <p className="text-center text-sm font-medium text-[var(--danger,#e5484d)]">
          {err}
        </p>
      )}

      {connected ? (
        (anyEmpty || anyPending) && (
          <button
            onClick={() => run(() => planMyDay())}
            disabled={busy}
            className="sc-btn sc-btn-primary py-4 text-lg"
          >
            <Sparkles size={22} />
            {busy ? "Planning…" : "Plan my day"}
          </button>
        )
      ) : (
        <p className="text-center text-sm text-[var(--muted)]">
          Connect your AI key in Settings to auto-fill the empty meals.
        </p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  of,
}: {
  label: string;
  value: number;
  of: number;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-lg font-bold tabular-nums leading-tight">
        {Math.round(value)}
      </span>
      <span className="text-xs text-[var(--muted)]">
        / {Math.round(of)} {label}
      </span>
    </div>
  );
}
