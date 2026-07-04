"use client";

import { useState } from "react";
import { logFood } from "./actions";

const empty = {
  name: "",
  grams: "",
  kcal: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
};

export default function AddFoodForm() {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof empty, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await logFood({
        name: form.name.trim(),
        grams: form.grams ? Number(form.grams) : null,
        kcal: Number(form.kcal) || 0,
        protein_g: Number(form.protein_g) || 0,
        carbs_g: Number(form.carbs_g) || 0,
        fat_g: Number(form.fat_g) || 0,
      });
      setForm(empty);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="What did you eat?"
        className="rounded-2xl border-2 border-black/10 px-4 py-3 text-lg outline-none focus:border-green-500 dark:border-white/15 dark:bg-transparent"
      />

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Calories"
          value={form.kcal}
          onChange={(v) => set("kcal", v)}
        />
        <NumberField
          label="Grams"
          value={form.grams}
          onChange={(v) => set("grams", v)}
        />
        <NumberField
          label="Protein (g)"
          value={form.protein_g}
          onChange={(v) => set("protein_g", v)}
        />
        <NumberField
          label="Carbs (g)"
          value={form.carbs_g}
          onChange={(v) => set("carbs_g", v)}
        />
        <NumberField
          label="Fat (g)"
          value={form.fat_g}
          onChange={(v) => set("fat_g", v)}
        />
      </div>

      <button
        onClick={submit}
        disabled={saving || !form.name.trim()}
        className="mt-2 w-full rounded-2xl bg-green-500 px-6 py-4 text-lg font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50"
      >
        {saving ? "Adding…" : "Add to today"}
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-black/50 dark:text-white/50">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="rounded-xl border-2 border-black/10 px-3 py-2 text-lg outline-none focus:border-green-500 dark:border-white/15 dark:bg-transparent"
      />
    </label>
  );
}
