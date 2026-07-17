"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ScanBarcode, Link2, KeyRound } from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { ExtraPer100g, OffProduct } from "@/lib/types";
import { addPantryItem, importPantryUrl } from "./actions";

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
// from Open Food Facts), paste a shop product link (AI reads its nutrition), or
// type it in. `initialName` seeds the name field when arriving from the day
// planner's "not in your pantry" prompt. The link import works without a key
// for pages that publish structured nutrition; `connected` only drives the hint
// that a key unlocks pages that hide it.
export default function PantryForm({
  initialName = "",
  connected = false,
}: {
  initialName?: string;
  connected?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ ...empty, name: initialName });
  const [barcode, setBarcode] = useState<string | null>(null);
  // Pack weight (grams) and how many portions the user splits a pack into. One
  // portion = pack ÷ portions, so a countable food ("6 bagels", "2 portions")
  // can be picked by count and the app does the macro maths from grams.
  const [pack, setPack] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [portions, setPortions] = useState("");
  // Extra per-100g nutrients from a scan (kept out of the visible form).
  const [scannedExtras, setScannedExtras] = useState<ExtraPer100g>(NO_EXTRAS);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
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
      setPack(p.pack_size_g == null ? "" : String(p.pack_size_g));
      setUnitLabel(p.unit_label ?? "");
      // OFF gave grams-per-serving; show it as portions-per-pack for the form.
      setPortions(
        p.unit_g && p.pack_size_g ? String(Math.round(p.pack_size_g / p.unit_g)) : "",
      );
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

  // Paste a shop product link → AI reads the page's nutrition → fill the form.
  // Fills the same fields the barcode path does, so the user reviews and edits
  // before saving. It's not a barcode, so off_barcode stays null.
  async function importUrl() {
    const link = url.trim();
    if (!link) return;
    setNote("Reading the link…");
    setImporting(true);
    try {
      const p = await importPantryUrl(link);
      setBarcode(null);
      setPack(p.pack_size_g == null ? "" : String(p.pack_size_g));
      // A parsed web page carries no serving; clear any unit left from a scan.
      setUnitLabel("");
      setPortions("");
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
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function add() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const packG = pack.trim() === "" ? null : Number(pack) || null;
      const n = portions.trim() === "" ? null : Number(portions) || null;
      // Grams in one portion = pack weight ÷ portions per pack; needs both.
      const unit_g = packG && n && n > 0 ? Math.round(packG / n) : null;
      await addPantryItem({
        name: form.name.trim(),
        off_barcode: barcode,
        quantity: 1,
        kcal_100g: Number(form.kcal_100g) || 0,
        protein_100g: Number(form.protein_100g) || 0,
        carbs_100g: Number(form.carbs_100g) || 0,
        fat_100g: Number(form.fat_100g) || 0,
        ...scannedExtras,
        pack_size_g: packG,
        unit_g,
        unit_label: unit_g ? unitLabel.trim() || null : null,
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

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a shop product link"
          inputMode="url"
          className="sc-input min-w-0 flex-1"
        />
        <button
          onClick={importUrl}
          disabled={importing || !url.trim()}
          aria-label="Import from link"
          className="sc-btn sc-btn-soft shrink-0"
        >
          <Link2 size={20} /> {importing ? "Reading…" : "Import"}
        </button>
      </div>

      {!connected && (
        <Link
          href="/me"
          className="flex items-center justify-center gap-1.5 text-center text-sm text-[var(--muted)]"
        >
          <KeyRound size={14} /> Connect your key to read pages that hide their nutrition.
        </Link>
      )}

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

      <Field label="Pack size (g, optional)" value={pack} onChange={setPack} />

      {/* Count instead of weigh: name the portion and say how many a pack makes
          (6 bagels, 2 portions). One portion = pack ÷ portions, so the food can
          be picked by count and the app works out the macros. */}
      <p className="mt-1 text-xs text-[var(--muted)]">
        Eaten in portions? Split a pack (optional)
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Portion name</span>
          <input
            value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value)}
            placeholder="bagel"
            className="sc-input text-lg"
          />
        </label>
        <Field label="Portions per pack" value={portions} onChange={setPortions} />
      </div>
      {pack.trim() !== "" && Number(portions) > 0 && (
        <p className="text-xs text-[var(--muted)]">
          One {unitLabel.trim() || "portion"} ≈{" "}
          {Math.round(Number(pack) / Number(portions))} g
        </p>
      )}

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
