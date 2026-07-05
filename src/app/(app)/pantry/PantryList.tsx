"use client";

import { useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import type { PantryItem } from "@/lib/types";
import { setPantryQuantity } from "./actions";

// The user's pantry. Tap +/− to change how many they have; zero removes it.
export default function PantryList({ items }: { items: PantryItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
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
    <li className="sc-card flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{item.name}</p>
        <p className="text-xs text-[var(--muted)]">
          {Math.round(item.kcal_100g)} kcal / 100g
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          onClick={() => step(-1)}
          disabled={pending}
          aria-label="One fewer"
          className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(15,23,42,0.05)] active:scale-90 disabled:opacity-40"
        >
          <Minus size={18} />
        </button>
        <span className="w-6 text-center font-semibold tabular-nums">
          {item.quantity}
        </span>
        <button
          onClick={() => step(1)}
          disabled={pending}
          aria-label="One more"
          className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(15,23,42,0.05)] active:scale-90 disabled:opacity-40"
        >
          <Plus size={18} />
        </button>
      </div>
    </li>
  );
}
