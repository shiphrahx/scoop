"use client";

import { useState } from "react";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { OffProduct } from "@/lib/types";
import { addPantryItem } from "./actions";

const empty = {
  name: "",
  kcal_100g: "",
  protein_100g: "",
  carbs_100g: "",
  fat_100g: "",
};

// Add something to the pantry: scan its barcode (fills name + per-100g macros
// from Open Food Facts) or type it in.
export default function PantryForm() {
  const [form, setForm] = useState(empty);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const set = (key: keyof typeof empty, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleDetected(code: string) {
    setScanning(false);
    setNote("Looking up…");
    try {
      const res = await fetch(`/api/off/${encodeURIComponent(code)}`);
      if (!res.ok) {
        setBarcode(code);
        setNote(`No match for ${code}. Enter it by hand.`);
        return;
      }
      const p = (await res.json()) as OffProduct;
      setBarcode(p.barcode);
      setForm({
        name: p.name,
        kcal_100g: String(p.kcal_100g),
        protein_100g: String(p.protein_100g),
        carbs_100g: String(p.carbs_100g),
        fat_100g: String(p.fat_100g),
      });
      setNote(`Found: ${p.name}`);
    } catch {
      setNote("Lookup failed. Enter it by hand.");
    }
  }

  async function add() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await addPantryItem({
        name: form.name.trim(),
        off_barcode: barcode,
        quantity: 1,
        kcal_100g: Number(form.kcal_100g) || 0,
        protein_100g: Number(form.protein_100g) || 0,
        carbs_100g: Number(form.carbs_100g) || 0,
        fat_100g: Number(form.fat_100g) || 0,
      });
      setForm(empty);
      setBarcode(null);
      setNote(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 sc-card p-5">
      <h2 className="text-lg font-bold">Add to pantry</h2>

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
        placeholder="Item name"
        className="rounded-2xl border-2 border-black/10 px-4 py-3 text-lg outline-none focus:border-green-500 dark:bg-transparent"
      />

      <p className="text-xs text-black/50 dark:text-white/50">Per 100g</p>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Calories"
          value={form.kcal_100g}
          onChange={(v) => set("kcal_100g", v)}
        />
        <Field
          label="Protein"
          value={form.protein_100g}
          onChange={(v) => set("protein_100g", v)}
        />
        <Field
          label="Carbs"
          value={form.carbs_100g}
          onChange={(v) => set("carbs_100g", v)}
        />
        <Field
          label="Fat"
          value={form.fat_100g}
          onChange={(v) => set("fat_100g", v)}
        />
      </div>

      <button
        onClick={add}
        disabled={saving || !form.name.trim()}
        className="mt-1 w-full sc-btn sc-btn-primary py-4 text-lg"
      >
        {saving ? "Adding…" : "Add item"}
      </button>

      {scanning && (
        <BarcodeScanner
          onDetected={handleDetected}
          onClose={() => setScanning(false)}
        />
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
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
        className="rounded-xl border-2 border-black/10 px-3 py-2 text-lg outline-none focus:border-green-500 dark:bg-transparent"
      />
    </label>
  );
}
