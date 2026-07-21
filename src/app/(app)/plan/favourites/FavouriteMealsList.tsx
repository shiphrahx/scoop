"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import type { FavouriteMeal } from "@/lib/types";
import { deleteFavouriteMeal } from "../day/actions";

// Each favourite meal as a card: its name, the foods in it, and its macros, with
// a delete button. The macros are the meal's stored totals — what you'd log if
// you added it and ate it.
export default function FavouriteMealsList({ meals }: { meals: FavouriteMeal[] }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {meals.map((m) => (
          <li key={m.id} className="sc-card flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 truncate font-semibold">{m.name}</p>
              <button
                onClick={() => {
                  setErr(null);
                  startTransition(async () => {
                    try {
                      await deleteFavouriteMeal(m.id);
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : "Couldn't delete it.");
                    }
                  });
                }}
                disabled={pending}
                aria-label={`Delete ${m.name}`}
                className="shrink-0 text-[var(--muted)] transition active:scale-90 disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </div>

            {m.items.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {m.items.map((it, i) => (
                  <li key={i} className="sc-chip" data-active>
                    {it.name}
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs font-medium text-[var(--muted)]">
              {Math.round(m.kcal)} kcal · Protein {Math.round(m.protein_g)} g ·
              Carbs {Math.round(m.carbs_g)} g · Fat {Math.round(m.fat_g)} g
            </p>
          </li>
        ))}
      </ul>

      {err && (
        <p className="text-center text-sm font-medium text-[var(--danger,#e5484d)]">
          {err}
        </p>
      )}
    </section>
  );
}
