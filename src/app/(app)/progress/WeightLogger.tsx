"use client";

import { useState } from "react";
import { logWeight } from "./actions";

// One-tap weigh-in: pre-filled with the last weight, nudge with ± then Save.
export default function WeightLogger({ last }: { last: number | null }) {
  const [value, setValue] = useState(last ?? 80);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const nudge = (delta: number) =>
    setValue((v) => Math.round((v + delta) * 10) / 10);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await logWeight(value);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sc-card flex flex-col gap-4 p-5">
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={() => nudge(-0.1)}
          className="h-12 w-12 rounded-full bg-black/5 text-2xl font-black active:scale-90 dark:bg-white/10"
          aria-label="Decrease"
        >
          −
        </button>
        <div className="text-center">
          <span className="text-5xl font-black tabular-nums">
            {value.toFixed(1)}
          </span>
          <span className="ml-1 text-lg text-[var(--muted)]">kg</span>
        </div>
        <button
          onClick={() => nudge(0.1)}
          className="h-12 w-12 rounded-full bg-black/5 text-2xl font-black active:scale-90 dark:bg-white/10"
          aria-label="Increase"
        >
          +
        </button>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="sc-btn sc-btn-primary w-full py-4 text-lg"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Log today's weight"}
      </button>
    </div>
  );
}
