"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanBarcode, Minus, Plus } from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { ExtraPer100g, OffProduct } from "@/lib/types";
import { addPantryItem } from "./actions";

const NO_EXTRAS: ExtraPer100g = {
  fiber_100g: 0, sugar_100g: 0, satfat_100g: 0, sodium_mg_100g: 0,
};

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
  const router = useRouter();
  const [form, setForm] = useState(empty);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [packSize, setPackSize] = useState<number | null>(null);
  // Extra per-100g nutrients from a scan (kept out of the visible form).
  const [scannedExtras, setScannedExtras] = useState<ExtraPer100g>(NO_EXTRAS);
  const [quantity, setQuantity] = useState(1);
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
      setPackSize(p.pack_size_g);
      setScannedExtras({
        fiber_100g: p.fiber_100g,
        sugar_100g: p.sugar_100g,
        satfat_100g: p.satfat_100g,
        sodium_mg_100g: p.sodium_mg_100g,
      });
      setForm({
        name: p.name,
        kcal_100g: String(p.kcal_100g),
        protein_100g: String(p.protein_100g),
        carbs_100g: String(p.carbs_100g),
        fat_100g: String(p.fat_100g),
      });
      setNote(
        p.pack_size_g ? `Found: ${p.name} (${p.pack_size_g} g)` : `Found: ${p.name}`,
      );
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
        quantity,
        kcal_100g: Number(form.kcal_100g) || 0,
        protein_100g: Number(form.protein_100g) || 0,
        carbs_100g: Number(form.carbs_100g) || 0,
        fat_100g: Number(form.fat_100g) || 0,
        ...scannedExtras,
        pack_size_g: packSize,
      });
      // Show the item where it now lives instead of an empty add form.
      router.push("/pantry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 sc-card p-5">
      <h2 className="text-lg font-semibold">Add to pantry</h2>

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
        placeholder="Item name"
        className="sc-input text-lg"
      />

      <p className="text-xs text-[var(--muted)]">Per 100g</p>
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

      <div className="mt-1 flex items-center justify-between">
        <span className="text-sm font-semibold">How many packs</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label="One fewer"
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] active:scale-90"
          >
            <Minus size={18} />
          </button>
          <span className="w-6 text-center font-semibold tabular-nums">
            {quantity}
          </span>
          <button
            onClick={() => setQuantity((q) => q + 1)}
            aria-label="One more"
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] active:scale-90"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      <button
        onClick={add}
        disabled={saving || !form.name.trim()}
        className="w-full sc-btn sc-btn-primary py-4 text-lg"
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
