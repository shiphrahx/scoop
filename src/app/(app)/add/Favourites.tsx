"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import type { Favourite } from "@/lib/types";
import { deleteFavourite, logFavourite } from "./actions";

// "My usual" — tap a chip to log it to today, tap the cross to remove it.
export default function Favourites({ items }: { items: Favourite[] }) {
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          My usual
        </h2>
        <button
          onClick={() => setEditing((e) => !e)}
          className="text-sm font-semibold"
          style={{ color: "#0f766e" }}
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
              data-active={editing}
              className={`sc-chip active:scale-95 disabled:opacity-40 ${
                editing ? "border-rose-300 text-rose-600" : ""
              }`}
            >
              <span className="font-semibold">{fav.name}</span>
              <span className="text-xs text-[var(--muted)]">
                {editing ? <X size={14} /> : `${Math.round(fav.kcal)} kcal`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
