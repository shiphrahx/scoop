"use client";

import { useState } from "react";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { OffProduct } from "@/lib/types";
import { logFood } from "./actions";

const empty = {
  name: "",
  grams: "",
  kcal: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
};

// Macros for `grams` of a per-100g product, rounded to whole numbers.
function scale(per100: OffProduct, grams: number) {
  const f = grams / 100;
  return {
    kcal: String(Math.round(per100.kcal_100g * f)),
    protein_g: String(Math.round(per100.protein_100g * f)),
    carbs_g: String(Math.round(per100.carbs_100g * f)),
    fat_g: String(Math.round(per100.fat_100g * f)),
  };
}

export default function AddFoodForm() {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // When set, the macro fields are derived from grams (a scanned product).
  const [per100, setPer100] = useState<OffProduct | null>(null);

  const set = (key: keyof typeof empty, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Typing a macro by hand breaks the link to the scanned per-100g values.
  const setMacro = (key: "kcal" | "protein_g" | "carbs_g" | "fat_g", v: string) => {
    setPer100(null);
    set(key, v);
  };

  const setGrams = (v: string) => {
    if (per100) {
      const g = Number(v) || 0;
      setForm((f) => ({ ...f, grams: v, ...scale(per100, g) }));
    } else {
      set("grams", v);
    }
  };

  async function handleDetected(barcode: string) {
    setScanning(false);
    setNote("Looking up…");
    try {
      const res = await fetch(`/api/off/${encodeURIComponent(barcode)}`);
      if (!res.ok) {
        setNote(`No match for ${barcode}. Enter it by hand.`);
        return;
      }
      const p = (await res.json()) as OffProduct;
      setPer100(p);
      // Default to a 100 g serving; the user can adjust grams to rescale.
      setForm({ ...empty, name: p.name, grams: "100", ...scale(p, 100) });
      setNote(`Found: ${p.name} — set your grams.`);
    } catch {
      setNote("Lookup failed. Enter it by hand.");
    }
  }

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
        source: per100 ? "barcode" : "manual",
      });
      setForm(empty);
      setPer100(null);
      setNote(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => {
          setNote(null);
          setScanning(true);
        }}
        className="flex items-center justify-center gap-2 rounded-2xl border-2 border-green-500 px-6 py-4 text-lg font-bold text-green-600 active:scale-95 dark:text-green-400"
      >
        <span className="text-2xl">📷</span> Scan barcode
      </button>

      {note && (
        <p className="text-center text-sm font-medium text-black/60 dark:text-white/60">
          {note}
        </p>
      )}

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
          onChange={(v) => setMacro("kcal", v)}
        />
        <NumberField label="Grams" value={form.grams} onChange={setGrams} />
        <NumberField
          label="Protein (g)"
          value={form.protein_g}
          onChange={(v) => setMacro("protein_g", v)}
        />
        <NumberField
          label="Carbs (g)"
          value={form.carbs_g}
          onChange={(v) => setMacro("carbs_g", v)}
        />
        <NumberField
          label="Fat (g)"
          value={form.fat_g}
          onChange={(v) => setMacro("fat_g", v)}
        />
      </div>

      <button
        onClick={submit}
        disabled={saving || !form.name.trim()}
        className="mt-2 w-full rounded-2xl bg-green-500 px-6 py-4 text-lg font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50"
      >
        {saving ? "Adding…" : "Add to today"}
      </button>

      {scanning && (
        <BarcodeScanner
          onDetected={handleDetected}
          onClose={() => setScanning(false)}
        />
      )}
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
