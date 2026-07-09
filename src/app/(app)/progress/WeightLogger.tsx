"use client";

import { useState } from "react";
import { Minus, Plus, Check } from "lucide-react";
import { logWeight } from "./actions";

// Local today as YYYY-MM-DD (not UTC, so "today" matches the user's calendar).
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// One-tap weigh-in: pre-filled with the last weight, nudge with ± then Save.
// Defaults to today; pick a past date to back-fill a day you forgot.
export default function WeightLogger({ last }: { last: number | null }) {
  const today = localToday();
  const [value, setValue] = useState(last ?? 80);
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const nudge = (delta: number) =>
    setValue((v) => Math.round((v + delta) * 10) / 10);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await logWeight(value, date);
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
          className="grid h-12 w-12 place-items-center rounded-full bg-[var(--fill)] active:scale-90"
          aria-label="Decrease"
        >
          <Minus size={22} />
        </button>
        <div className="text-center">
          <span className="text-5xl font-bold tabular-nums">
            {value.toFixed(1)}
          </span>
          <span className="ml-1 text-lg text-[var(--muted)]">kg</span>
        </div>
        <button
          onClick={() => nudge(0.1)}
          className="grid h-12 w-12 place-items-center rounded-full bg-[var(--fill)] active:scale-90"
          aria-label="Increase"
        >
          <Plus size={22} />
        </button>
      </div>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">Date</span>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => {
            setDate(e.target.value || today);
            setSaved(false);
          }}
          className="sc-input w-auto"
        />
      </label>

      <button
        onClick={save}
        disabled={saving}
        className="sc-btn sc-btn-primary w-full py-4 text-lg"
      >
        {saving ? (
          "Saving…"
        ) : saved ? (
          <>
            <Check size={18} /> Saved
          </>
        ) : date === today ? (
          "Log today's weight"
        ) : (
          `Log weight for ${date}`
        )}
      </button>
    </div>
  );
}
