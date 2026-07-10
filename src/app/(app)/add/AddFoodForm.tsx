"use client";

import { useState } from "react";
import { ScanBarcode, Star } from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { OffProduct } from "@/lib/types";
import { NUTRIENTS, type NutrientKey } from "@/lib/nutrients";
import { logFood, saveFavourite } from "./actions";

// All nutrient totals we hold on the form, as strings for the inputs. Only the
// user's chosen nutrients are shown, but a scan fills them all so nothing is
// lost from the log.
type Totals = {
  protein_g: string; carbs_g: string; fat_g: string;
  fiber_g: string; sugar_g: string; satfat_g: string; sodium_mg: string;
};
const emptyTotals: Totals = {
  protein_g: "", carbs_g: "", fat_g: "",
  fiber_g: "", sugar_g: "", satfat_g: "", sodium_mg: "",
};
const empty = { name: "", grams: "", kcal: "", ...emptyTotals };

// Per-100g field on an OffProduct for each nutrient key.
const PER100: Record<Exclude<NutrientKey, "kcal">, keyof OffProduct> = {
  protein: "protein_100g", carbs: "carbs_100g", fat: "fat_100g",
  fiber: "fiber_100g", sugar: "sugar_100g", satfat: "satfat_100g",
  sodium: "sodium_mg_100g",
};

// Scale a scanned per-100g product to `grams`, for every nutrient.
function scale(per100: OffProduct, grams: number) {
  const f = grams / 100;
  const out = {
    kcal: String(Math.round(per100.kcal_100g * f)),
  } as Record<string, string>;
  for (const key of Object.keys(PER100) as (keyof typeof PER100)[]) {
    const field = NUTRIENTS[key].field; // e.g. "protein_g", "sodium_mg"
    out[field] = String(Math.round(Number(per100[PER100[key]]) * f));
  }
  return out;
}

export default function AddFoodForm({ prefs }: { prefs: NutrientKey[] }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [per100, setPer100] = useState<OffProduct | null>(null);

  const set = (key: keyof typeof empty, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Typing a macro by hand breaks the link to the scanned per-100g values.
  const setMacro = (key: keyof typeof empty, v: string) => {
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
      setForm({ ...empty, name: p.name, grams: "100", ...scale(p, 100) });
      setNote(`Found: ${p.name} — set your grams.`);
    } catch {
      setNote("Lookup failed. Enter it by hand.");
    }
  }

  // Build the payload nutrient totals from the form.
  function totals() {
    return {
      kcal: Number(form.kcal) || 0,
      protein_g: Number(form.protein_g) || 0,
      carbs_g: Number(form.carbs_g) || 0,
      fat_g: Number(form.fat_g) || 0,
      fiber_g: Number(form.fiber_g) || 0,
      sugar_g: Number(form.sugar_g) || 0,
      satfat_g: Number(form.satfat_g) || 0,
      sodium_mg: Number(form.sodium_mg) || 0,
    };
  }

  async function saveUsual() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const t = totals();
      await saveFavourite({
        name: form.name.trim(),
        grams: form.grams ? Number(form.grams) : null,
        kcal: t.kcal,
        protein_g: t.protein_g,
        carbs_g: t.carbs_g,
        fat_g: t.fat_g,
      });
      setNote(`Saved "${form.name.trim()}" to My usual.`);
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await logFood({
        name: form.name.trim(),
        grams: form.grams ? Number(form.grams) : null,
        source: per100 ? "barcode" : "manual",
        ...totals(),
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
        className="sc-btn sc-btn-soft py-4 text-lg"
      >
        <ScanBarcode size={22} /> Scan barcode
      </button>

      {note && (
        <p className="text-center text-sm font-medium text-[var(--muted)]">
          {note}
        </p>
      )}

      <input
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="What did you eat?"
        className="sc-input text-lg"
      />

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Calories"
          value={form.kcal}
          onChange={(v) => setMacro("kcal", v)}
        />
        <NumberField label="Grams" value={form.grams} onChange={setGrams} />
        {prefs.map((key) => {
          const def = NUTRIENTS[key];
          const field = def.field as keyof typeof empty;
          return (
            <NumberField
              key={key}
              label={`${def.label} (${def.unit})`}
              value={form[field]}
              onChange={(v) => setMacro(field, v)}
            />
          );
        })}
      </div>

      <button
        onClick={submit}
        disabled={saving || !form.name.trim()}
        className="mt-2 w-full sc-btn sc-btn-primary py-4 text-lg"
      >
        {saving ? "Adding…" : "Add to today"}
      </button>

      <button
        onClick={saveUsual}
        disabled={saving || !form.name.trim()}
        className="sc-btn w-full py-3 text-sm font-semibold text-[var(--g-teal)] active:scale-95 disabled:opacity-40"
        style={{ color: "var(--ink-teal)" }}
      >
        <Star size={16} /> Save as usual
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
      <span className="text-[var(--muted)]">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="sc-input text-lg"
      />
    </label>
  );
}
