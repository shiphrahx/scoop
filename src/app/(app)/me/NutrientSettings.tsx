"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import {
  NUTRIENTS,
  SELECTABLE_NUTRIENTS,
  normalizePrefs,
  type NutrientKey,
} from "@/lib/nutrients";
import { saveNutrientPrefs } from "./actions";

// Choose which nutrients appear in every breakdown (Home, Plan my day, Add
// food). Calories are always shown, so they're not in the list.
export default function NutrientSettings({ initial }: { initial: string[] }) {
  const start = normalizePrefs(initial);
  const [picked, setPicked] = useState<NutrientKey[]>(start);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(picked) !== JSON.stringify(start);

  function toggle(key: NutrientKey) {
    setSaved(false);
    setPicked((p) =>
      p.includes(key)
        ? p.filter((k) => k !== key)
        : // keep registry order so the breakdown reads consistently
          SELECTABLE_NUTRIENTS.filter((k) => p.includes(k) || k === key),
    );
  }

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveNutrientPrefs(picked);
      setSaved(true);
    });
  }

  return (
    <section className="flex w-full flex-col gap-4 sc-card p-5 text-left">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Nutrients shown</h2>
        <p className="text-sm text-[var(--muted)]">
          Which nutrients to track in your breakdowns. Calories are always shown.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SELECTABLE_NUTRIENTS.map((key) => {
          const def = NUTRIENTS[key];
          const on = picked.includes(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              data-active={on}
              className="sc-chip"
            >
              {on && <Check size={14} />} {def.label}
              <span className="text-[var(--muted)]"> ({def.unit})</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={save}
        disabled={pending || (!dirty && !saved)}
        className="sc-btn sc-btn-primary w-full py-3"
      >
        {pending ? (
          "Saving…"
        ) : saved && !dirty ? (
          <>
            <Check size={18} /> Saved
          </>
        ) : (
          "Save nutrients"
        )}
      </button>
    </section>
  );
}
