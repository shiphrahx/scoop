"use client";

import { useTransition } from "react";
import type { PantryItem } from "@/lib/types";
import { setPantryQuantity } from "./actions";

// The user's pantry. Tap +/− to change how many they have; zero removes it.
export default function PantryList({ items }: { items: PantryItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-black/40 dark:text-white/40">
        Pantry is empty. Scan a barcode to add something.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <PantryRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

function PantryRow({ item }: { item: PantryItem }) {
  const [pending, startTransition] = useTransition();

  const step = (delta: number) =>
    startTransition(() => setPantryQuantity(item.id, item.quantity + delta));

  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15">
      <div className="min-w-0">
        <p className="truncate font-semibold">{item.name}</p>
        <p className="text-xs text-black/50 dark:text-white/50">
          {Math.round(item.kcal_100g)} kcal / 100g
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          onClick={() => step(-1)}
          disabled={pending}
          aria-label="One fewer"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-xl font-bold active:scale-90 disabled:opacity-40 dark:bg-white/10"
        >
          −
        </button>
        <span className="w-6 text-center font-bold tabular-nums">
          {item.quantity}
        </span>
        <button
          onClick={() => step(1)}
          disabled={pending}
          aria-label="One more"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-xl font-bold active:scale-90 disabled:opacity-40 dark:bg-white/10"
        >
          +
        </button>
      </div>
    </li>
  );
}
