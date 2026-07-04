"use client";

import { useTransition } from "react";
import { deleteFood } from "./actions";

export default function DeleteFoodButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => deleteFood(id))}
      disabled={pending}
      aria-label="Delete"
      className="text-xl text-black/30 transition active:scale-90 disabled:opacity-40 dark:text-white/30"
    >
      ✕
    </button>
  );
}
