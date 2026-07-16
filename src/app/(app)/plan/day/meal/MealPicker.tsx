"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Drumstick,
  Droplet,
  Package,
  PackagePlus,
  Salad,
  ScanBarcode,
  Search,
  Wheat,
  X,
} from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { FoodChoice, MealPick, OffProduct } from "@/lib/types";
import { searchFoods, setMealPicks } from "../actions";
import { addPantryItem } from "@/app/(app)/pantry/actions";

type Groups = {
  protein: MealPick[];
  carb: MealPick[];
  fat: MealPick[];
  other: MealPick[];
};

const SECTIONS: { key: keyof Groups; title: string; icon: ReactNode }[] = [
  { key: "protein", title: "Proteins", icon: <Drumstick size={16} /> },
  { key: "carb", title: "Carbs", icon: <Wheat size={16} /> },
  { key: "fat", title: "Fats", icon: <Droplet size={16} /> },
  { key: "other", title: "Everything else", icon: <Salad size={16} /> },
];

// Pick the foods for one meal. Tap pantry chips (grouped by what they bring to
// the plate), search the pantry, or scan a barcode. Saving stores the picks;
// the grams come later, from "Build my day" on the plan screen.
export default function MealPicker({
  slot,
  date,
  groups,
  initial,
}: {
  slot: string;
  date?: string;
  groups: Groups;
  initial: MealPick[];
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<MealPick[]>(initial);
  const [busy, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  // A just-scanned product not in the pantry yet: offer to add it there too.
  const [pantryOffer, setPantryOffer] = useState<MealPick | null>(null);

  const picked = (name: string) => picks.some((p) => p.name === name);

  function toggle(food: MealPick) {
    setPicks((prev) =>
      prev.some((p) => p.name === food.name)
        ? prev.filter((p) => p.name !== food.name)
        : [...prev, food],
    );
  }

  function addChoice(c: FoodChoice) {
    if (picked(c.name)) return;
    setPicks((prev) => [
      ...prev,
      {
        name: c.name,
        source: c.source,
        off_barcode: c.off_barcode,
        kcal_100g: c.kcal_100g,
        protein_100g: c.protein_100g,
        carbs_100g: c.carbs_100g,
        fat_100g: c.fat_100g,
        fiber_100g: c.fiber_100g,
        sugar_100g: c.sugar_100g,
        satfat_100g: c.satfat_100g,
        sodium_mg_100g: c.sodium_mg_100g,
        pack_size_g: c.pack_size_g,
      },
    ]);
  }

  // Scan a barcode: look the product up on Open Food Facts (same endpoint the
  // pantry scanner uses), add it as a pick, and offer to save it to the pantry
  // so next time it's a chip.
  async function handleScan(barcode: string) {
    setScanning(false);
    setScanNote("Looking up…");
    try {
      const res = await fetch(`/api/off/${encodeURIComponent(barcode)}`);
      if (!res.ok) {
        setScanNote(`No match for ${barcode}. Try the search instead.`);
        return;
      }
      const p = (await res.json()) as OffProduct;
      const pick: MealPick = {
        name: p.name,
        source: "off",
        off_barcode: p.barcode,
        kcal_100g: p.kcal_100g,
        protein_100g: p.protein_100g,
        carbs_100g: p.carbs_100g,
        fat_100g: p.fat_100g,
        fiber_100g: p.fiber_100g,
        sugar_100g: p.sugar_100g,
        satfat_100g: p.satfat_100g,
        sodium_mg_100g: p.sodium_mg_100g,
        pack_size_g: p.pack_size_g,
      };
      setPicks((prev) =>
        prev.some((x) => x.name === pick.name) ? prev : [...prev, pick],
      );
      setScanNote(null);
      setPantryOffer(pick);
    } catch {
      setScanNote("Lookup failed. Try the search instead.");
    }
  }

  function addOfferToPantry() {
    const offer = pantryOffer;
    if (!offer) return;
    setPantryOffer(null);
    startTransition(async () => {
      try {
        await addPantryItem({
          name: offer.name,
          off_barcode: offer.off_barcode,
          quantity: 1,
          kcal_100g: offer.kcal_100g,
          protein_100g: offer.protein_100g,
          carbs_100g: offer.carbs_100g,
          fat_100g: offer.fat_100g,
          fiber_100g: offer.fiber_100g,
          sugar_100g: offer.sugar_100g,
          satfat_100g: offer.satfat_100g,
          sodium_mg_100g: offer.sodium_mg_100g,
          pack_size_g: offer.pack_size_g,
        });
        setScanNote(`${offer.name} added to your pantry too.`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't add it to the pantry.");
      }
    });
  }

  function save() {
    setErr(null);
    startTransition(async () => {
      try {
        await setMealPicks(slot, picks, date);
        router.push(date ? `/plan/day?date=${date}` : "/plan/day");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't save the meal.");
      }
    });
  }

  const anyPantry = SECTIONS.some(({ key }) => groups[key].length > 0);

  return (
    <section className="flex flex-col gap-5">
      {/* What's picked so far */}
      {picks.length > 0 && (
        <div className="sc-card flex flex-col gap-2 p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            This meal
          </span>
          <ul className="flex flex-wrap gap-2">
            {picks.map((p) => (
              <li key={p.name}>
                <button
                  onClick={() => toggle(p)}
                  disabled={busy}
                  className="sc-chip"
                  data-active
                >
                  {p.name} <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {err && (
        <p className="text-center text-sm font-medium text-[var(--danger,#e5484d)]">
          {err}
        </p>
      )}

      {/* Pantry chips, grouped by what they bring to the plate */}
      {anyPantry ? (
        SECTIONS.map(({ key, title, icon }) =>
          groups[key].length === 0 ? null : (
            <div key={key} className="flex flex-col gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--ink-teal)]">
                {icon} {title}
              </span>
              <div className="flex flex-wrap gap-2">
                {groups[key].map((f) => (
                  <button
                    key={f.name}
                    onClick={() => toggle(f)}
                    disabled={busy}
                    data-active={picked(f.name)}
                    className="sc-chip"
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          ),
        )
      ) : (
        <p className="sc-card p-4 text-sm text-[var(--muted)]">
          Your pantry is empty — search or scan below, or add items on the
          Pantry screen first.
        </p>
      )}

      <PickSearchBox onPick={addChoice} disabled={busy} />

      <button
        onClick={() => {
          setScanNote(null);
          setScanning(true);
        }}
        disabled={busy}
        className="sc-btn sc-btn-soft"
      >
        <ScanBarcode size={18} /> Scan a barcode
      </button>

      {scanNote && (
        <p className="text-center text-xs font-medium text-[var(--muted)]">
          {scanNote}
        </p>
      )}

      {/* Add the scanned product to the pantry as well? */}
      {pantryOffer && (
        <div className="sc-card flex items-center gap-3 p-4">
          <PackagePlus size={18} className="shrink-0 text-[var(--ink-teal)]" />
          <span className="min-w-0 flex-1 text-sm">
            Add <span className="font-semibold">{pantryOffer.name}</span> to your
            pantry too?
          </span>
          <button
            onClick={addOfferToPantry}
            disabled={busy}
            className="sc-btn sc-btn-soft px-4 py-2"
          >
            Yes
          </button>
          <button
            onClick={() => setPantryOffer(null)}
            disabled={busy}
            className="sc-btn sc-btn-neutral px-4 py-2"
          >
            No
          </button>
        </div>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="sc-btn sc-btn-primary py-4 text-lg"
      >
        {busy ? (
          "Saving…"
        ) : picks.length > 0 ? (
          <>
            <Check size={20} /> Save this meal
          </>
        ) : initial.length > 0 ? (
          "Clear this meal"
        ) : (
          "Back without saving"
        )}
      </button>

      {scanning && (
        <BarcodeScanner
          onDetected={handleScan}
          onClose={() => setScanning(false)}
        />
      )}
    </section>
  );
}

// Search the pantry for a food to pick. Mirrors the plan screen's search box
// but hands back the choice itself — no grams involved here.
function PickSearchBox({
  onPick,
  disabled,
}: {
  onPick: (c: FoodChoice) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodChoice[]>([]);
  const [searching, setSearching] = useState(false);

  const term = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    const t = setTimeout(
      async () => {
        if (term.length < 2) {
          setResults([]);
          setSearching(false);
          return;
        }
        setSearching(true);
        try {
          setResults(await searchFoods(term));
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      },
      term.length < 2 ? 0 : 300,
    );
    return () => clearTimeout(t);
  }, [term]);

  function add(c: FoodChoice) {
    onPick(c);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
        <Search size={16} />
      </span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
        placeholder="Search your pantry…"
        className="sc-input w-full"
        style={{ paddingLeft: "2.5rem" }}
      />

      {(searching || results.length > 0) && term.length >= 2 && (
        <ul className="absolute z-10 mt-1 flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--glass-bg-solid)] shadow-lg">
          {searching && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-[var(--muted)]">Searching…</li>
          )}
          {results.map((c, i) => (
            <li key={`${c.off_barcode ?? c.name}-${i}`}>
              <button
                onClick={() => add(c)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-[var(--fill-soft)]"
              >
                <Package size={15} className="shrink-0 text-[var(--ink-teal)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block text-xs text-[var(--muted)]">
                    {Math.round(c.kcal_100g)} kcal/100g
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!searching && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-[var(--muted)]">
              Nothing in your pantry matches — try the scanner.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
