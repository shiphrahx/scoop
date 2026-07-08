"use client";

import { useState } from "react";
import { ScanBarcode, Plus, X } from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { OffProduct, SourcePack } from "@/lib/types";
import { createBatch } from "./actions";

const emptyPack = {
  name: "",
  grams: "",
  kcal: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
};

function scale(per100: OffProduct, grams: number) {
  const f = grams / 100;
  return {
    kcal: String(Math.round(per100.kcal_100g * f)),
    protein_g: String(Math.round(per100.protein_100g * f)),
    carbs_g: String(Math.round(per100.carbs_100g * f)),
    fat_g: String(Math.round(per100.fat_100g * f)),
  };
}

// Build a batch: add the packs that went in (scan or type), then the total
// cooked weight. Macros-per-gram is worked out from the packs + cooked weight.
export default function BatchForm() {
  const [name, setName] = useState("");
  const [packs, setPacks] = useState<SourcePack[]>([]);
  const [draft, setDraft] = useState(emptyPack);
  const [per100, setPer100] = useState<OffProduct | null>(null);
  const [totalCooked, setTotalCooked] = useState("");
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const setField = (key: keyof typeof emptyPack, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setMacro = (
    key: "kcal" | "protein_g" | "carbs_g" | "fat_g",
    v: string,
  ) => {
    setPer100(null);
    setField(key, v);
  };

  const setGrams = (v: string) => {
    if (per100) {
      const g = Number(v) || 0;
      setDraft((d) => ({ ...d, grams: v, ...scale(per100, g) }));
    } else {
      setField("grams", v);
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
      setDraft({ ...emptyPack, name: p.name, grams: "100", ...scale(p, 100) });
      setNote(`Found: ${p.name} — set the pack weight.`);
    } catch {
      setNote("Lookup failed. Enter it by hand.");
    }
  }

  function addPack() {
    if (!draft.name.trim()) return;
    setPacks((ps) => [
      ...ps,
      {
        name: draft.name.trim(),
        grams: Number(draft.grams) || 0,
        kcal: Number(draft.kcal) || 0,
        protein_g: Number(draft.protein_g) || 0,
        carbs_g: Number(draft.carbs_g) || 0,
        fat_g: Number(draft.fat_g) || 0,
      },
    ]);
    setDraft(emptyPack);
    setPer100(null);
    setNote(null);
  }

  const totals = packs.reduce(
    (s, p) => ({ kcal: s.kcal + p.kcal, grams: s.grams + p.grams }),
    { kcal: 0, grams: 0 },
  );

  async function create() {
    if (!name.trim() || packs.length === 0 || !totalCooked) return;
    setSaving(true);
    try {
      await createBatch({
        name: name.trim(),
        source_packs: packs,
        total_cooked_g: Number(totalCooked),
      });
      setName("");
      setPacks([]);
      setTotalCooked("");
      setNote("Batch saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 sc-card p-5">
      <h2 className="text-lg font-semibold">New batch</h2>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Batch name (e.g. Sunday chilli)"
        className="sc-input text-lg"
      />

      {/* Packs added so far */}
      {packs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {packs.map((p, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--fill-soft)] px-4 py-2"
            >
              <span className="min-w-0 truncate font-semibold">{p.name}</span>
              <span className="shrink-0 text-xs text-[var(--muted)]">
                {p.grams}g · {Math.round(p.kcal)} kcal
              </span>
              <button
                onClick={() => setPacks((ps) => ps.filter((_, j) => j !== i))}
                aria-label="Remove pack"
                className="shrink-0 text-[var(--muted)] active:scale-90"
              >
                <X size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Draft pack editor */}
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-[var(--border)] p-4">
        <button
          onClick={() => {
            setNote(null);
            setScanning(true);
          }}
          className="sc-btn sc-btn-soft"
        >
          <ScanBarcode size={20} /> Scan a pack
        </button>

        {note && (
          <p className="text-center text-sm font-medium text-[var(--muted)]">
            {note}
          </p>
        )}

        <input
          value={draft.name}
          onChange={(e) => setField("name", e.target.value)}
          placeholder="Pack name"
          className="sc-input"
        />

        <div className="grid grid-cols-2 gap-2">
          <Field label="Grams" value={draft.grams} onChange={setGrams} />
          <Field
            label="Calories"
            value={draft.kcal}
            onChange={(v) => setMacro("kcal", v)}
          />
          <Field
            label="Protein"
            value={draft.protein_g}
            onChange={(v) => setMacro("protein_g", v)}
          />
          <Field
            label="Carbs"
            value={draft.carbs_g}
            onChange={(v) => setMacro("carbs_g", v)}
          />
          <Field
            label="Fat"
            value={draft.fat_g}
            onChange={(v) => setMacro("fat_g", v)}
          />
        </div>

        <button
          onClick={addPack}
          disabled={!draft.name.trim()}
          className="sc-btn sc-btn-neutral"
        >
          <Plus size={18} /> Add pack
        </button>
      </div>

      {/* Cooked weight + create */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">
          Total cooked weight (g)
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={totalCooked}
          onChange={(e) => setTotalCooked(e.target.value)}
          placeholder="e.g. 1800"
          className="sc-input text-lg"
        />
      </label>

      {packs.length > 0 && (
        <p className="text-sm text-[var(--muted)]">
          {packs.length} pack{packs.length > 1 ? "s" : ""} · {totals.grams}g raw
          · {Math.round(totals.kcal)} kcal total
        </p>
      )}

      <button
        onClick={create}
        disabled={
          saving || !name.trim() || packs.length === 0 || !totalCooked
        }
        className="w-full sc-btn sc-btn-primary py-4 text-lg"
      >
        {saving ? "Saving…" : "Save batch"}
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
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-[var(--muted)]">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="sc-input text-base"
      />
    </label>
  );
}
