"use client";

import { useState, useTransition } from "react";
import { Plus, X, GripVertical, Check, ChevronUp, ChevronDown } from "lucide-react";
import { saveMealSlots } from "./actions";

// Edit the named meals a day breaks into. These become the slots on the
// "Plan my day" screen, in this order.
export default function MealSlotsSettings({ initial }: { initial: string[] }) {
  const [slots, setSlots] = useState<string[]>(
    initial.length ? initial : [""],
  );
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(slots) !== JSON.stringify(initial);

  function update(i: number, value: string) {
    setSlots((s) => s.map((v, j) => (j === i ? value : v)));
    setSaved(false);
  }
  function remove(i: number) {
    setSlots((s) => s.filter((_, j) => j !== i));
    setSaved(false);
  }
  function add() {
    setSlots((s) => [...s, ""]);
    setSaved(false);
  }
  function move(i: number, dir: -1 | 1) {
    setSlots((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSaved(false);
  }

  const canSave = slots.some((s) => s.trim());

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveMealSlots(slots);
      setSlots((s) => s.map((v) => v.trim()).filter(Boolean));
      setSaved(true);
    });
  }

  return (
    <section className="flex w-full flex-col gap-4 sc-card p-5 text-left">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Meals a day</h2>
        <p className="text-sm text-[var(--muted)]">
          The meals your day splits into. Used when you plan your day.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {slots.map((slot, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[var(--muted)]">
              <GripVertical size={18} />
            </span>
            <input
              value={slot}
              onChange={(e) => update(i, e.target.value)}
              placeholder="Meal name"
              className="sc-input flex-1"
            />
            <div className="flex flex-col">
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="text-[var(--muted)] transition disabled:opacity-30 active:scale-90"
                aria-label="Move up"
              >
                <ChevronUp size={16} />
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === slots.length - 1}
                className="text-[var(--muted)] transition disabled:opacity-30 active:scale-90"
                aria-label="Move down"
              >
                <ChevronDown size={16} />
              </button>
            </div>
            <button
              onClick={() => remove(i)}
              disabled={slots.length === 1}
              className="text-[var(--muted)] transition disabled:opacity-30 active:scale-90"
              aria-label="Remove meal"
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={add}
        className="sc-btn sc-btn-soft w-full"
        type="button"
      >
        <Plus size={18} /> Add a meal
      </button>

      <button
        onClick={save}
        disabled={pending || !canSave || (!dirty && !saved)}
        className="sc-btn sc-btn-primary w-full py-3"
      >
        {pending ? (
          "Saving…"
        ) : saved && !dirty ? (
          <>
            <Check size={18} /> Saved
          </>
        ) : (
          "Save meals"
        )}
      </button>
    </section>
  );
}
