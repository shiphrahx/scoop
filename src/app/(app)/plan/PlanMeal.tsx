"use client";

import { useState, useTransition } from "react";
import type { MealSuggestion } from "@/lib/types";
import { getSuggestions, logSuggestion } from "./actions";

// Tap once to get dish ideas from the pantry that fit today's macros and the
// user's diet, then tap to log the one they made.
export default function PlanMeal({ hasPantry }: { hasPantry: boolean }) {
  const [meals, setMeals] = useState<MealSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [logged, setLogged] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function suggest() {
    setLoading(true);
    setNote("Thinking up dishes…");
    try {
      const found = await getSuggestions();
      setMeals(found);
      setLogged(new Set());
      setNote(found.length ? null : "No dishes fit right now. Add pantry items.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't get ideas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <button
        onClick={suggest}
        disabled={loading}
        className="flex items-center justify-center gap-2 sc-btn sc-btn-primary py-4 text-lg"
      >
        <span className="text-2xl">✨</span>
        {loading ? "Thinking…" : meals ? "New ideas" : "Suggest a meal"}
      </button>

      {!hasPantry && !meals && (
        <p className="text-center text-sm text-black/50 dark:text-white/50">
          Add a few pantry items first for the best ideas.
        </p>
      )}

      {note && (
        <p className="text-center text-sm font-medium text-black/60 dark:text-white/60">
          {note}
        </p>
      )}

      {meals && meals.length > 0 && (
        <ul className="flex flex-col gap-3">
          {meals.map((m, i) => (
            <li
              key={i}
              className="flex flex-col gap-2 sc-card p-4"
            >
              <p className="text-lg font-bold">{m.name}</p>
              <p className="text-sm text-black/60 dark:text-white/60">{m.why}</p>
              {m.uses.length > 0 && (
                <p className="text-xs text-black/50 dark:text-white/50">
                  Uses: {m.uses.join(", ")}
                </p>
              )}
              <p className="text-xs text-black/50 dark:text-white/50">
                {Math.round(m.kcal)} kcal · P{Math.round(m.protein_g)} C
                {Math.round(m.carbs_g)} F{Math.round(m.fat_g)}
              </p>
              <button
                disabled={logged.has(i)}
                onClick={() =>
                  startTransition(async () => {
                    await logSuggestion(m);
                    setLogged((prev) => new Set(prev).add(i));
                  })
                }
                className="mt-1 rounded-xl bg-green-500 px-4 py-2 font-bold text-white active:scale-95 disabled:opacity-50"
              >
                {logged.has(i) ? "Logged ✓" : "I made this — log it"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
