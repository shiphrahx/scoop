"use client";

import { useState, useTransition } from "react";
import type { Favourite } from "@/lib/types";
import { deleteFavourite, logFavourite } from "./actions";

// "My usual" — tap a chip to log it to today, tap ✕ to remove it.
export default function Favourites({ items }: { items: Favourite[] }) {
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-black/50 dark:text-white/50">
          My usual
        </h2>
        <button
          onClick={() => setEditing((e) => !e)}
          className="text-sm font-semibold text-green-600 dark:text-green-400"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      <ul className="flex flex-wrap gap-2">
        {items.map((fav) => (
          <li key={fav.id}>
            <button
              disabled={busyId === fav.id}
              onClick={() => {
                setBusyId(fav.id);
                startTransition(async () => {
                  if (editing) {
                    await deleteFavourite(fav.id);
                  } else {
                    await logFavourite(fav.id);
                  }
                  setBusyId(null);
                });
              }}
              className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 font-semibold active:scale-95 disabled:opacity-40 ${
                editing
                  ? "border-rose-400 text-rose-600 dark:text-rose-400"
                  : "border-black/10 dark:border-white/15"
              }`}
            >
              <span>{fav.name}</span>
              <span className="text-xs text-black/40 dark:text-white/40">
                {editing ? "✕" : `${Math.round(fav.kcal)} kcal`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
