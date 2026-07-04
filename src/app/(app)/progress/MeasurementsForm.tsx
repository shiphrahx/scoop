"use client";

import { useState } from "react";
import { logMeasurements } from "./actions";

const fields = [
  { key: "waist_cm", label: "Waist" },
  { key: "arms_cm", label: "Arms" },
  { key: "thighs_cm", label: "Thighs" },
  { key: "hips_cm", label: "Hips" },
] as const;

type Key = (typeof fields)[number]["key"];

export default function MeasurementsForm({
  initial,
}: {
  initial: Partial<Record<Key, number>>;
}) {
  const [values, setValues] = useState<Record<Key, string>>({
    waist_cm: initial.waist_cm?.toString() ?? "",
    arms_cm: initial.arms_cm?.toString() ?? "",
    thighs_cm: initial.thighs_cm?.toString() ?? "",
    hips_cm: initial.hips_cm?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await logMeasurements({
        waist_cm: values.waist_cm ? Number(values.waist_cm) : null,
        arms_cm: values.arms_cm ? Number(values.arms_cm) : null,
        thighs_cm: values.thighs_cm ? Number(values.thighs_cm) : null,
        hips_cm: values.hips_cm ? Number(values.hips_cm) : null,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-black/10 p-5 dark:border-white/15">
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="text-black/50 dark:text-white/50">
              {f.label} (cm)
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={values[f.key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
              placeholder="0"
              className="rounded-xl border-2 border-black/10 px-3 py-2 text-lg outline-none focus:border-green-500 dark:border-white/15 dark:bg-transparent"
            />
          </label>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-2xl bg-green-500 px-6 py-4 text-lg font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-60"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save measurements"}
      </button>
    </div>
  );
}
