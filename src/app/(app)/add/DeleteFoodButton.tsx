"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { deleteFood } from "./actions";

export default function DeleteFoodButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => deleteFood(id))}
      disabled={pending}
      aria-label="Delete"
      className="text-[var(--muted)] transition active:scale-90 disabled:opacity-40"
    >
      <X size={20} />
    </button>
  );
}
