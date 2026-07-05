"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import type { Recipe } from "@/lib/types";
import { deleteRecipe } from "./actions";

export default function SavedRecipes({ recipes }: { recipes: Recipe[] }) {
  const [pending, startTransition] = useTransition();

  if (recipes.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Saved recipes
      </h2>
      <ul className="flex flex-col gap-2">
        {recipes.map((r) => {
          const per = r.kcal / Math.max(1, r.servings);
          return (
            <li
              key={r.id}
              className="sc-card flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {r.servings} servings · {Math.round(per)} kcal each
                </p>
              </div>
              <button
                onClick={() => startTransition(() => deleteRecipe(r.id))}
                disabled={pending}
                aria-label="Delete recipe"
                className="shrink-0 text-[var(--muted)] active:scale-90 disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
