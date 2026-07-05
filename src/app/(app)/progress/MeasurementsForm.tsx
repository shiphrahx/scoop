"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { logMeasurements } from "./actions";

const fields = [
  { key: "chest_cm", label: "Chest" },
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
    chest_cm: initial.chest_cm?.toString() ?? "",
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
        chest_cm: values.chest_cm ? Number(values.chest_cm) : null,
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
    <div className="sc-card flex flex-col gap-4 p-5">
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-[var(--muted)]">
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
              className="sc-input text-lg"
            />
          </label>
        ))}
      </div>

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
        ) : (
          "Save measurements"
        )}
      </button>
    </div>
  );
}
