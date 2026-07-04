"use client";

import { useTransition } from "react";
import type { Recipe } from "@/lib/types";
import { deleteRecipe } from "./actions";

export default function SavedRecipes({ recipes }: { recipes: Recipe[] }) {
  const [pending, startTransition] = useTransition();

  if (recipes.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-black/50 dark:text-white/50">
        Saved recipes
      </h2>
      <ul className="flex flex-col gap-2">
        {recipes.map((r) => {
          const per = r.kcal / Math.max(1, r.servings);
          return (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.name}</p>
                <p className="text-xs text-black/50 dark:text-white/50">
                  {r.servings} servings · {Math.round(per)} kcal each
                </p>
              </div>
              <button
                onClick={() => startTransition(() => deleteRecipe(r.id))}
                disabled={pending}
                aria-label="Delete recipe"
                className="shrink-0 text-xl text-black/30 active:scale-90 disabled:opacity-40 dark:text-white/30"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
