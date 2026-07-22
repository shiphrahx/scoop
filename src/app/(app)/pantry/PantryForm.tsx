"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanBarcode, Link2, Apple } from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";
import { cookedName, cookedStapleFor, defaultSize, pantryUnitLabel } from "@/lib/freshfoods";
import type { ExtraPer100g, FreshFood, OffProduct, UnitOption } from "@/lib/types";
import { addFreshFoodSize, addPantryItem, findFreshFoods, importPantryUrl } from "./actions";

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
// planner's "not in your pantry" prompt.
export default function PantryForm({
  initialName = "",
}: {
  initialName?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ ...empty, name: initialName });
  const [barcode, setBarcode] = useState<string | null>(null);
  // The macro / pack / portion fields are hidden until there's a reason to show
  // them: a scan or link fills them in (auto-reveal), or the user opens them to
  // type by hand. Keeps the add screen down to a name + the scan/import buttons.
  const [showDetails, setShowDetails] = useState(false);
  // Pack weight (grams) and how many portions the user splits a pack into. One
  // portion = pack ÷ portions, so a countable food ("6 bagels", "2 portions")
  // can be picked by count and the app does the macro maths from grams.
  const [pack, setPack] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [portions, setPortions] = useState("");
  // Fresh-food match state. `matches` are reference foods whose name looks like
  // what's typed; picking one fills the macros and offers its sizes. `sizes` are
  // the picked food's sizes (small/med/large…), `selectedSize` which one the
  // user has, and `freshId` the reference id (set only for a picked reference
  // food, so a new size can be contributed back). Typing again clears the pick.
  const [matches, setMatches] = useState<FreshFood[]>([]);
  const [sizes, setSizes] = useState<UnitOption[]>([]);
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [freshId, setFreshId] = useState<string | null>(null);
  const [picked, setPicked] = useState(false);
  // Extra per-100g nutrients from a scan (kept out of the visible form).
  const [scannedExtras, setScannedExtras] = useState<ExtraPer100g>(NO_EXTRAS);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const set = (key: keyof typeof empty, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Look up fresh whole foods as the user types the name, so a "banana" offers
  // its small/medium/large sizes and macros without any numbers being typed.
  // Debounced; skipped once a barcode or a match has filled the form (retyping
  // the name clears the pick, which re-enables the search).
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const q = form.name.trim();
      if (barcode || picked || q.length < 2) {
        if (live) setMatches([]);
        return;
      }
      try {
        const found = await findFreshFoods(q);
        if (live) setMatches(found);
      } catch {
        if (live) setMatches([]);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [form.name, barcode, picked]);

  // Forget any picked fresh food (its sizes and reference id). Called when a
  // scan/import takes over, or when the user retypes the name by hand.
  function clearFresh() {
    setPicked(false);
    setSizes([]);
    setSelectedSize("");
    setFreshId(null);
  }

  // Editing the name by hand drops a previous fresh-food pick so the search runs
  // again — the item is no longer "the banana we filled in".
  function onNameChange(value: string) {
    set("name", value);
    if (picked) clearFresh();
  }

  // Take a matched fresh food: fill the macros, load its sizes, and default to a
  // sensible size. off_barcode stays null (it isn't a packaged product).
  // `displayName` overrides the shown name when a dry staple is swapped onto the
  // reference's cooked macros but must keep the user's own product name (e.g.
  // "Penne (cooked)"), so distinct staples don't collapse onto the reference.
  function pickFresh(food: FreshFood, displayName?: string) {
    const name = displayName ?? food.name;
    setBarcode(null);
    setPicked(true);
    setMatches([]);
    setShowDetails(true);
    setFreshId(food.id);
    setSizes(food.sizes);
    setSelectedSize(defaultSize(food.sizes)?.label ?? "");
    // A fresh food is counted by size, not split from a pack — clear those.
    setPack("");
    setPortions("");
    setUnitLabel("");
    setScannedExtras({
      fiber_100g: food.fiber_100g,
      sugar_100g: food.sugar_100g,
      satfat_100g: food.satfat_100g,
      sodium_mg_100g: food.sodium_mg_100g,
    });
    setForm({
      name,
      kcal_100g: String(food.kcal_100g),
      protein_100g: String(food.protein_100g),
      carbs_100g: String(food.carbs_100g),
      fat_100g: String(food.fat_100g),
    });
    setNote(`Fresh food: ${name}. Pick a size below.`);
  }

  // Add a new size to the picked food: keep it on this item and contribute it to
  // the shared reference so everyone gets it next time.
  async function addSize(label: string, grams: number) {
    const clean = label.trim();
    if (!clean || !(grams > 0)) return;
    if (sizes.some((s) => s.label.toLowerCase() === clean.toLowerCase())) return;
    setSizes((s) => [...s, { label: clean, grams }].sort((a, b) => a.grams - b.grams));
    setSelectedSize(clean);
    if (freshId) {
      try {
        await addFreshFoodSize(freshId, clean, grams);
      } catch {
        /* keeping it on the item is enough; the shared add is best-effort */
      }
    }
  }

  async function handleDetected(code: string) {
    setScanning(false);
    setNote("Looking up…");
    try {
      const res = await fetch(`/api/off/${encodeURIComponent(code)}`);
      if (!res.ok) {
        setBarcode(code);
        setNote(`No match for ${code}. Enter it by hand.`);
        setShowDetails(true);
        return;
      }
      const p = (await res.json()) as OffProduct;

      // A dry staple's pack shows DRY macros, but Scoop tracks food as eaten.
      // Swap to the cooked reference entry so rice/pasta/oats land cooked, and
      // tell the user what happened rather than silently trusting the bag.
      const stapleName = cookedStapleFor(p.name);
      if (stapleName) {
        const [ref] = await findFreshFoods(stapleName);
        if (ref) {
          pickFresh(ref, cookedName(p.name));
          setNote(
            `${p.name} is dry on the pack — Scoop tracks food cooked, so we've used cooked ${ref.name} values. Pick your cooked serving size.`,
          );
          return;
        }
      }

      clearFresh();
      setShowDetails(true);
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
      clearFresh();
      setShowDetails(true);
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
      // A fresh food is counted by size: the whole set rides along as
      // unit_options, and the selected size fills unit_g/unit_label ("medium
      // banana"). Otherwise fall back to the pack-split unit (pack ÷ portions).
      const chosen = sizes.find((s) => s.label === selectedSize) ?? null;
      const usingSizes = sizes.length > 0 && chosen != null;
      const unit_g = usingSizes
        ? chosen.grams
        : packG && n && n > 0
          ? Math.round(packG / n)
          : null;
      const unit_label = usingSizes
        ? pantryUnitLabel(form.name, chosen.label)
        : unit_g
          ? unitLabel.trim() || null
          : null;

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
        unit_label,
        unit_options: usingSizes ? sizes : null,
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

      {note && (
        <p className="text-center text-sm font-medium text-[var(--muted)]">
          {note}
        </p>
      )}

      <input
        value={form.name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Item name"
        className="sc-input text-lg"
      />

      {/* Fresh whole foods that match the name — tap one to fill its macros and
          get its sizes, no typing. */}
      {matches.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {matches.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => pickFresh(food)}
                className="sc-btn sc-btn-soft px-3 py-2 text-sm"
              >
                <Apple size={16} /> {food.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {sizes.length > 0 && (
        <SizePicker
          foodName={form.name}
          sizes={sizes}
          selected={selectedSize}
          onSelect={setSelectedSize}
          onAdd={addSize}
        />
      )}

      {showDetails ? (
        <>
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

          {/* A fresh food is counted by its sizes (above), so the pack-split
              route is only shown for packaged items. */}
          {sizes.length === 0 && (
            <>
              <Field label="Pack size (g, optional)" value={pack} onChange={setPack} />

              {/* Count instead of weigh: name the portion and say how many a pack
                  makes (6 bagels, 2 portions). One portion = pack ÷ portions, so
                  the food can be picked by count and the app works out macros. */}
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
            </>
          )}
        </>
      ) : (
        <button
          onClick={() => setShowDetails(true)}
          className="text-left text-sm font-medium text-[var(--ink-teal)]"
        >
          + Add macros &amp; pack details
        </button>
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

// Pick which size of a fresh food the user has. Each size is a tap; the one
// picked is highlighted and shows its weight. A small form adds a size we don't
// list (contributed back to the shared reference on save).
function SizePicker({
  foodName,
  sizes,
  selected,
  onSelect,
  onAdd,
}: {
  foodName: string;
  sizes: UnitOption[];
  selected: string;
  onSelect: (label: string) => void;
  onAdd: (label: string, grams: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [grams, setGrams] = useState("");
  const chosen = sizes.find((s) => s.label === selected) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-[var(--muted)]">What size?</p>
      <div className="flex flex-wrap gap-2">
        {sizes.map((s) => {
          const on = s.label === selected;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => onSelect(s.label)}
              className={`sc-btn px-3 py-2 text-sm capitalize ${on ? "sc-btn-primary" : "sc-btn-soft"}`}
            >
              {s.label}
              <span className={on ? "opacity-80" : "text-[var(--muted)]"}>
                {" "}
                {Math.round(s.grams)} g
              </span>
            </button>
          );
        })}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="sc-btn sc-btn-soft px-3 py-2 text-sm"
          >
            ＋ size
          </button>
        )}
      </div>

      {chosen && (
        <p className="text-xs text-[var(--muted)]">
          One {pantryUnitLabel(foodName, chosen.label)} ≈ {Math.round(chosen.grams)} g
        </p>
      )}

      {adding && (
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Size name</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="extra large"
              className="sc-input"
            />
          </label>
          <label className="flex w-24 flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Grams</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              placeholder="0"
              className="sc-input"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              onAdd(label, Number(grams));
              setLabel("");
              setGrams("");
              setAdding(false);
            }}
            disabled={!label.trim() || !(Number(grams) > 0)}
            className="sc-btn sc-btn-primary shrink-0 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
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
