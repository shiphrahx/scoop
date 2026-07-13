"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, X, Search, Plus, Minus, Package, PackagePlus, Globe, Trash2, ScanBarcode } from "lucide-react";
import type { FoodChoice, Macros, OffProduct, PlannedMeal, PlanItem } from "@/lib/types";
import { sumItems } from "@/lib/types";
import { NUTRIENTS, valueOf, formatNutrient, type NutrientKey } from "@/lib/nutrients";
import { NutrientStats } from "@/components/NutrientBreakdown";
import BarcodeScanner from "@/components/BarcodeScanner";
import {
  searchFoods,
  setMealItems,
  clearSlot,
  clearAppPlan,
  logPlannedMeal,
} from "./actions";

type Slot = { slot: string; meal: PlannedMeal | null };

// Sum every meal in the plan (built meals + AI dishes) for the day header.
function dayTotal(slots: Slot[]): Macros {
  return slots.reduce<Macros>(
    (s, { meal }) =>
      meal
        ? {
            kcal: s.kcal + meal.kcal,
            protein_g: s.protein_g + meal.protein_g,
            carbs_g: s.carbs_g + meal.carbs_g,
            fat_g: s.fat_g + meal.fat_g,
          }
        : s,
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

// Weight units we understand in the "add a food" box, in grams.
const UNIT_G: Record<string, number> = {
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
  g: 1, gram: 1, grams: 1,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000,
  ml: 1, milliliter: 1, milliliters: 1,
};
const UNIT = Object.keys(UNIT_G).join("|");

// Rough grams for size words when no exact weight is given. Food-agnostic
// guesses the user can adjust after adding.
const SIZE_G: Record<string, number> = {
  small: 80, regular: 120, medium: 120, large: 180, big: 180, jumbo: 220, xl: 220,
};
const SIZE = Object.keys(SIZE_G).join("|");

// Pull the amount out of a food query so the user can type the item and how
// much in one go. Handles exact weights ("50g shreddies", "rice 200 g") and
// size words ("medium banana"). Returns the grams (null when none given) and
// the food name to search on — size words are stripped so the search matches
// the food, not the adjective.
function parseFoodQuery(raw: string): { grams: number | null; term: string } {
  let s = raw.trim();

  // Strip a size word first (it isn't part of the food name) and remember its
  // default grams. An explicit weight, if also present, wins below.
  let sizeGrams: number | null = null;
  const sizeMatch = s.match(new RegExp(`(?:^|\\s)(${SIZE})(?:\\s|$)`, "i"));
  if (sizeMatch) {
    sizeGrams = SIZE_G[sizeMatch[1].toLowerCase()];
    s = s.replace(new RegExp(`(?:^|\\s)(${SIZE})(?:\\s|$)`, "i"), " ").replace(/\s+/g, " ").trim();
  }

  const lead = s.match(new RegExp(`^\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT})\\b\\s*(.+)$`, "i"));
  if (lead) return { grams: toGrams(lead[1], lead[2]), term: lead[3].trim() };
  const trail = s.match(new RegExp(`^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*(${UNIT})\\b\\s*$`, "i"));
  if (trail) return { grams: toGrams(trail[2], trail[3]), term: trail[1].trim() };

  return { grams: sizeGrams, term: s };
}

function toGrams(value: string, unit: string): number {
  const g = Number(value) * (UNIT_G[unit.toLowerCase()] ?? 1);
  return Math.max(1, Math.round(g));
}

// The macros a single item contributes at its current portion — shown under
// each food so the user sees what it costs, not just the meal total.
function itemMacroLine(it: PlanItem): string {
  const m = sumItems([it]);
  return (
    `${Math.round(m.kcal)} kcal · ` +
    `Protein ${Math.round(m.protein_g)} g · Carbs ${Math.round(m.carbs_g)} g · Fat ${Math.round(m.fat_g)} g`
  );
}

// The chosen-nutrient breakdown for a meal, one line: "420 kcal · Protein 34 g …"
function macroLine(prefs: NutrientKey[], m: Macros): string {
  const parts = [
    `${Math.round(m.kcal)} kcal`,
    ...prefs.map((k) => `${NUTRIENTS[k].label} ${formatNutrient(valueOf(m, k), k)}`),
  ];
  return parts.join(" · ");
}

export default function DayPlan({
  slots,
  target,
  prefs,
}: {
  slots: Slot[];
  target: Macros | null;
  prefs: NutrientKey[];
}) {
  const [busy, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const total = dayTotal(slots);
  // Meals the app planned that the user hasn't eaten — the ones "Remove the
  // app's plan" clears (their own built meals and eaten meals are kept).
  const anyAppPlanned = slots.some(
    (s) => s.meal?.origin === "ai" && !s.meal.logged_food_id,
  );

  function run(fn: () => Promise<void>) {
    setErr(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-4">
      {target && (
        <div className="sc-card p-4">
          <NutrientStats prefs={prefs} consumed={total} target={target} />
        </div>
      )}

      {slots.map(({ slot, meal }) => (
        <div key={slot} className="sc-card flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {slot}
            </span>
            {meal && !meal.logged_food_id && (
              <button
                onClick={() => run(() => clearSlot(slot))}
                disabled={busy}
                className="text-[var(--muted)] transition active:scale-90"
                aria-label={`Clear ${slot}`}
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Eaten already */}
          {meal?.logged_food_id ? (
            <>
              <p className="text-lg font-semibold">{meal.name}</p>
              <p className="text-xs text-[var(--muted)]">{macroLine(prefs, meal)}</p>
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-teal)]">
                <Check size={16} /> Eaten
              </p>
            </>
          ) : meal?.origin === "ai" ? (
            /* AI-suggested dish */
            <AiMeal meal={meal} prefs={prefs} busy={busy} onLog={() => run(() => logPlannedMeal(meal.id))} />
          ) : (
            /* Empty or user-built: pick a list of foods */
            <ItemPicker
              slot={slot}
              initial={meal?.items ?? []}
              mealId={meal?.id ?? null}
              prefs={prefs}
              busy={busy}
              onError={setErr}
              onLog={meal ? () => run(() => logPlannedMeal(meal.id)) : undefined}
            />
          )}
        </div>
      ))}

      {err && (
        <p className="text-center text-sm font-medium text-[var(--danger,#e5484d)]">
          {err}
        </p>
      )}

      {anyAppPlanned && (
        <button
          onClick={() => run(() => clearAppPlan())}
          disabled={busy}
          className="sc-btn sc-btn-neutral py-3"
        >
          <Trash2 size={18} />
          {busy ? "Removing…" : "Remove the app's plan"}
        </button>
      )}
    </section>
  );
}

// A user-built meal: a searchable list of foods (pantry first, then the web).
function ItemPicker({
  slot,
  initial,
  mealId,
  prefs,
  busy,
  onError,
  onLog,
}: {
  slot: string;
  initial: PlanItem[];
  mealId: string | null;
  prefs: NutrientKey[];
  busy: boolean;
  onError: (msg: string) => void;
  onLog?: () => void;
}) {
  const [items, setItems] = useState<PlanItem[]>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Persist the list whenever it changes.
  function save(next: PlanItem[]) {
    setItems(next);
    startTransition(async () => {
      try {
        await setMealItems(slot, next);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Couldn't save the meal.");
      }
    });
  }

  // The user can type the amount with the item ("50g shreddies") — split it so
  // we search the food name and remember the grams they gave.
  const parsed = useMemo(() => parseFoodQuery(query), [query]);

  // Debounced search on the food name only. All state updates happen inside the
  // timer (never synchronously in the effect).
  useEffect(() => {
    const term = parsed.term;
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
  }, [parsed.term]);

  function add(c: FoodChoice) {
    // Honour the amount the user typed; otherwise seed from the pack size.
    const grams =
      parsed.grams ?? (c.pack_size_g && c.pack_size_g <= 500 ? c.pack_size_g : 100);
    save([
      ...items,
      {
        name: c.name,
        source: c.source,
        off_barcode: c.off_barcode,
        grams,
        kcal_100g: c.kcal_100g,
        protein_100g: c.protein_100g,
        carbs_100g: c.carbs_100g,
        fat_100g: c.fat_100g,
        fiber_100g: c.fiber_100g,
        sugar_100g: c.sugar_100g,
        satfat_100g: c.satfat_100g,
        sodium_mg_100g: c.sodium_mg_100g,
      },
    ]);
    setQuery("");
    setResults([]);
  }

  function setGrams(i: number, grams: number) {
    const g = Math.max(0, Math.round(grams));
    save(items.map((it, j) => (j === i ? { ...it, grams: g } : it)));
  }

  // Scan a barcode straight into this meal: look the product up on Open Food
  // Facts (same endpoint the pantry/batch scanners use) and add it as an item.
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
      add({
        name: p.name,
        source: "off",
        off_barcode: p.barcode,
        brand: null,
        kcal_100g: p.kcal_100g,
        protein_100g: p.protein_100g,
        carbs_100g: p.carbs_100g,
        fat_100g: p.fat_100g,
        fiber_100g: p.fiber_100g,
        sugar_100g: p.sugar_100g,
        satfat_100g: p.satfat_100g,
        sodium_mg_100g: p.sodium_mg_100g,
        pack_size_g: p.pack_size_g,
      });
      setScanNote(`Added ${p.name} — set the grams.`);
    } catch {
      setScanNote("Lookup failed. Try the search instead.");
    }
  }

  const total = sumItems(items);

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-2xl bg-[var(--fill-soft)] p-3"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate font-medium">
                  {it.source === "pantry" ? (
                    <Package size={14} className="shrink-0 text-[var(--ink-teal)]" />
                  ) : (
                    <Globe size={14} className="shrink-0 text-[var(--muted)]" />
                  )}
                  <span className="truncate">{it.name}</span>
                </span>
                <span className="block text-xs text-[var(--muted)]">
                  {itemMacroLine(it)}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => setGrams(i, it.grams - 25)}
                  disabled={busy || it.grams <= 0}
                  className="grid h-7 w-7 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90 disabled:opacity-40"
                  aria-label="Less"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  value={it.grams}
                  onChange={(e) => setGrams(i, Number(e.target.value))}
                  className="w-12 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
                  aria-label={`${it.name} grams`}
                />
                <span className="text-xs text-[var(--muted)]">g</span>
                <button
                  onClick={() => setGrams(i, it.grams + 25)}
                  disabled={busy}
                  className="grid h-7 w-7 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90"
                  aria-label="More"
                >
                  <Plus size={14} />
                </button>
              </div>
              <button
                onClick={() => save(items.filter((_, j) => j !== i))}
                disabled={busy}
                className="shrink-0 text-[var(--muted)] transition active:scale-90"
                aria-label={`Remove ${it.name}`}
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Search + add */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
          <Search size={16} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a food… e.g. 50g shreddies"
          className="sc-input w-full"
          style={{ paddingLeft: "2.5rem" }}
        />

        {(searching || results.length > 0) && parsed.term.length >= 2 && (
          <ul className="absolute z-10 mt-1 flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--glass-bg-solid)] shadow-lg">
            {searching && results.length === 0 && (
              <li className="px-4 py-3 text-sm text-[var(--muted)]">Searching…</li>
            )}
            {results.map((c, i) => (
              <li key={`${c.source}-${c.off_barcode ?? c.name}-${i}`}>
                <button
                  onClick={() => add(c)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-[var(--fill-soft)]"
                >
                  {c.source === "pantry" ? (
                    <Package size={15} className="shrink-0 text-[var(--ink-teal)]" />
                  ) : (
                    <Globe size={15} className="shrink-0 text-[var(--muted)]" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {c.name}
                      {c.brand ? (
                        <span className="text-[var(--muted)]"> · {c.brand}</span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-[var(--muted)]">
                      {c.source === "pantry" ? "In your pantry" : "Web"} ·{" "}
                      {parsed.grams != null
                        ? `add ${parsed.grams} g`
                        : `${Math.round(c.kcal_100g)} kcal/100g`}
                    </span>
                  </span>
                  <Plus size={16} className="shrink-0 text-[var(--muted)]" />
                </button>
              </li>
            ))}
            {!searching && results.length === 0 && (
              <li>
                <Link
                  href={`/pantry/add?name=${encodeURIComponent(parsed.term)}`}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-[var(--fill-soft)]"
                >
                  <PackagePlus size={15} className="shrink-0 text-[var(--ink-teal)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      Not in your pantry
                    </span>
                    <span className="block text-xs text-[var(--muted)]">
                      Add &ldquo;{parsed.term}&rdquo; to the pantry?
                    </span>
                  </span>
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>

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

      {scanning && (
        <BarcodeScanner
          onDetected={handleScan}
          onClose={() => setScanning(false)}
        />
      )}

      {items.length > 0 && (
        <>
          <p className="text-xs font-medium text-[var(--muted)]">
            Meal total: {macroLine(prefs, total)}
          </p>
          {mealId && onLog && (
            <button onClick={onLog} disabled={busy} className="sc-btn sc-btn-soft">
              I ate this — log it
            </button>
          )}
        </>
      )}
    </div>
  );
}

function AiMeal({
  meal,
  prefs,
  busy,
  onLog,
}: {
  meal: PlannedMeal;
  prefs: NutrientKey[];
  busy: boolean;
  onLog: () => void;
}) {
  return (
    <>
      <p className="text-lg font-semibold">{meal.name}</p>
      {meal.portions.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-2xl bg-[var(--fill-soft)] p-3 text-sm">
          {meal.portions.map((p, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {Math.round(p.grams)} g
              </span>
            </li>
          ))}
        </ul>
      )}
      {meal.why && <p className="text-sm text-[var(--muted)]">{meal.why}</p>}
      {meal.swaps.length > 0 && (
        <p className="text-xs text-[var(--muted)]">Swaps: {meal.swaps.join(" · ")}</p>
      )}
      <p className="text-xs text-[var(--muted)]">{macroLine(prefs, meal)}</p>
      <button onClick={onLog} disabled={busy} className="sc-btn sc-btn-soft mt-1">
        I ate this — log it
      </button>
    </>
  );
}

