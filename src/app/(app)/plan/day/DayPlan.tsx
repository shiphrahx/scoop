"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Check, X, Search, Plus, Minus, Package, PackagePlus, Globe, Trash2, ScanBarcode, Pencil, AlertTriangle, AlertCircle, CopyPlus } from "lucide-react";
import type { FoodChoice, Macros, MealPortion, OffProduct, PlannedMeal, PlanItem } from "@/lib/types";
import { sumItems } from "@/lib/types";
import { parseFoodQuery } from "@/lib/foodquery";
import {
  NUTRIENTS,
  valueOf,
  formatNutrient,
  nutrientFit,
  worstFit,
  type FitStatus,
  type NutrientKey,
} from "@/lib/nutrients";
import { NutrientStats, FIT_TEXT } from "@/components/NutrientBreakdown";
import BarcodeScanner from "@/components/BarcodeScanner";
import {
  searchFoods,
  setMealItems,
  setMealPortions,
  clearSlot,
  clearAppPlan,
  copyFromYesterday,
  logPlannedMeal,
  unlogPlannedMeal,
  removePlannedMeal,
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

// The macros a single item contributes at its current portion — shown under
// each food so the user sees what it costs, not just the meal total.
function itemMacroLine(it: PlanItem): string {
  const m = sumItems([it]);
  return (
    `${Math.round(m.kcal)} kcal · ` +
    `Protein ${Math.round(m.protein_g)} g · Carbs ${Math.round(m.carbs_g)} g · Fat ${Math.round(m.fat_g)} g`
  );
}

// One AI portion's macros, when the plan stored them (older plans didn't).
function portionMacroLine(p: MealPortion): string | null {
  if (p.kcal == null) return null;
  return (
    `${Math.round(p.kcal)} kcal · ` +
    `Protein ${Math.round(p.protein_g ?? 0)} g · ` +
    `Carbs ${Math.round(p.carbs_g ?? 0)} g · Fat ${Math.round(p.fat_g ?? 0)} g`
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
  date,
}: {
  slots: Slot[];
  target: Macros | null;
  prefs: NutrientKey[];
  date: string;
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
        <div className="sc-card flex flex-col gap-3 p-4">
          <NutrientStats prefs={prefs} consumed={total} target={target} showFit />
          <FitVerdict total={total} target={target} prefs={prefs} />
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
                onClick={() => run(() => clearSlot(slot, date))}
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
            <EatenMeal
              meal={meal}
              prefs={prefs}
              busy={busy}
              onEdit={() => run(() => unlogPlannedMeal(meal.id))}
              onRemove={() => run(() => removePlannedMeal(meal.id))}
            />
          ) : meal?.origin === "ai" ? (
            /* AI-suggested dish */
            <AiMeal
              meal={meal}
              prefs={prefs}
              busy={busy}
              onError={setErr}
              onLog={() => run(() => logPlannedMeal(meal.id, date))}
            />
          ) : (
            /* Empty or user-built: pick a list of foods. Keyed on the meal id so
               a copied-in meal (new row) remounts with its items, rather than
               keeping this picker's empty state. */
            <ItemPicker
              key={meal?.id ?? "empty"}
              slot={slot}
              initial={meal?.items ?? []}
              mealId={meal?.id ?? null}
              prefs={prefs}
              busy={busy}
              date={date}
              onError={setErr}
              onLog={meal ? () => run(() => logPlannedMeal(meal.id, date)) : undefined}
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
          onClick={() => run(() => clearAppPlan(date))}
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

// Plain words for how the whole day lands on target, under the tiles: green when
// every nutrient is within 5 g, amber when something is drifting (up to 10 g),
// red when something is past that and has to change. Names the nutrients at
// fault so the user knows what to fix without reading every number.
function FitVerdict({
  total,
  target,
  prefs,
}: {
  total: Macros;
  target: Macros;
  prefs: NutrientKey[];
}) {
  // Nothing planned yet: the day is "off" by definition, but saying so helps
  // nobody. Ask for meals instead.
  if (total.kcal <= 0) {
    return (
      <p className="text-center text-sm text-[var(--muted)]">
        Add meals to see how the day lands against your targets.
      </p>
    );
  }

  const keys: NutrientKey[] = ["kcal", ...prefs];
  const status = worstFit(total, target, keys);

  // The nutrients that earned the verdict, worst first.
  const named = keys
    .filter((k) => nutrientFit(total, target, k)?.status === status)
    .map((k) => NUTRIENTS[k].label);

  const list = named.join(", ").replace(/, ([^,]*)$/, " and $1");

  const copy: Record<FitStatus, { icon: ReactNode; text: string }> = {
    ok: {
      icon: <Check size={16} className="shrink-0" />,
      text: "This plan lands on your targets.",
    },
    warn: {
      icon: <AlertTriangle size={16} className="shrink-0" />,
      text: `${list} slightly off — nudge the portions.`,
    },
    off: {
      icon: <AlertCircle size={16} className="shrink-0" />,
      text: `${list} too far off — change the portions.`,
    },
  };

  const { icon, text } = copy[status];

  return (
    <p
      className={`flex items-center justify-center gap-1.5 text-center text-sm font-semibold ${FIT_TEXT[status]}`}
      role="status"
    >
      {icon}
      {text}
    </p>
  );
}

// Search the pantry (or scan a barcode) to pick a food, handing the chosen
// FoodChoice and the grams to use back to the parent. Shared by the meal
// builder and the AI-meal editor so both add foods the same way. Typing an
// amount with the item ("50g shreddies") sets the grams; otherwise the pack
// size (or 100 g) seeds it.
function FoodSearchBox({
  onPick,
  disabled,
}: {
  onPick: (c: FoodChoice, grams: number) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

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
    onPick(c, grams);
    setQuery("");
    setResults([]);
  }

  // Scan a barcode straight in: look the product up on Open Food Facts (same
  // endpoint the pantry/batch scanners use) and add it.
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

  return (
    <>
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
        disabled={disabled}
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
    </>
  );
}

// A user-built meal: a searchable list of foods (pantry first, then the web).
function ItemPicker({
  slot,
  initial,
  mealId,
  prefs,
  busy,
  date,
  onError,
  onLog,
}: {
  slot: string;
  initial: PlanItem[];
  mealId: string | null;
  prefs: NutrientKey[];
  busy: boolean;
  date: string;
  onError: (msg: string) => void;
  onLog?: () => void;
}) {
  const [items, setItems] = useState<PlanItem[]>(initial);
  const [, startTransition] = useTransition();

  // Persist the list whenever it changes.
  function save(next: PlanItem[]) {
    setItems(next);
    startTransition(async () => {
      try {
        await setMealItems(slot, next, date);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Couldn't save the meal.");
      }
    });
  }

  // Pull yesterday's meal for this slot into today. The server refresh re-supplies
  // the slot, so the copied meal renders itself (AI dish or the items above).
  function copyYesterday() {
    startTransition(async () => {
      try {
        await copyFromYesterday(slot, date);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Couldn't copy yesterday's meal.");
      }
    });
  }

  // Append a picked food at the grams the search box resolved.
  function add(c: FoodChoice, grams: number) {
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
  }

  function setGrams(i: number, grams: number) {
    const g = Math.max(0, Math.round(grams));
    save(items.map((it, j) => (j === i ? { ...it, grams: g } : it)));
  }

  const total = sumItems(items);

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex flex-col gap-2 rounded-2xl bg-[var(--fill-soft)] p-3"
            >
              {/* Name + remove */}
              <div className="flex items-center gap-1.5 font-medium">
                {it.source === "pantry" ? (
                  <Package size={14} className="shrink-0 text-[var(--ink-teal)]" />
                ) : (
                  <Globe size={14} className="shrink-0 text-[var(--muted)]" />
                )}
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                <button
                  onClick={() => save(items.filter((_, j) => j !== i))}
                  disabled={busy}
                  className="shrink-0 text-[var(--muted)] transition active:scale-90"
                  aria-label={`Remove ${it.name}`}
                >
                  <X size={16} />
                </button>
              </div>

              <span className="block text-xs text-[var(--muted)]">
                {itemMacroLine(it)}
              </span>

              {/* Grams stepper */}
              <div className="flex items-center gap-1">
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
                  className="w-12 rounded-lg bg-[var(--fill)] py-1 text-center text-sm font-semibold tabular-nums outline-none"
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
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <button
          onClick={copyYesterday}
          disabled={busy}
          className="sc-btn sc-btn-soft"
        >
          <CopyPlus size={18} /> Copy from yesterday
        </button>
      )}

      <FoodSearchBox onPick={add} disabled={busy} />

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

// One AI-dish ingredient as a card: name + grams, and its macros beneath when
// the plan stored them. Shared by the planned and the eaten views.
function PortionRow({ portion }: { portion: MealPortion }) {
  const macros = portionMacroLine(portion);
  return (
    <li className="rounded-2xl bg-[var(--fill-soft)] p-3">
      <span className="flex items-center gap-1.5 font-medium">
        <span className="min-w-0 flex-1 truncate">{portion.name}</span>
        <span className="shrink-0 text-sm text-[var(--muted)] tabular-nums">
          {Math.round(portion.grams)} g
        </span>
      </span>
      {macros && (
        <span className="mt-0.5 block text-xs text-[var(--muted)]">{macros}</span>
      )}
    </li>
  );
}

// An eaten meal, laid out for reading: each food on its own row with its
// macros, then the meal total, then Edit (un-log back to editable) and Remove.
function EatenMeal({
  meal,
  prefs,
  busy,
  onEdit,
  onRemove,
}: {
  meal: PlannedMeal;
  prefs: NutrientKey[];
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      <p className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-teal)]">
        <Check size={16} /> Eaten
      </p>

      {meal.items.length > 0 ? (
        // A meal the user built — show every food with what it contributed.
        <ul className="flex flex-col gap-2">
          {meal.items.map((it, i) => (
            <li
              key={i}
              className="rounded-2xl bg-[var(--fill-soft)] p-3"
            >
              <span className="flex items-center gap-1.5 font-medium">
                {it.source === "pantry" ? (
                  <Package size={14} className="shrink-0 text-[var(--ink-teal)]" />
                ) : (
                  <Globe size={14} className="shrink-0 text-[var(--muted)]" />
                )}
                <span className="truncate">{it.name}</span>
                <span className="ml-auto shrink-0 text-sm text-[var(--muted)] tabular-nums">
                  {Math.round(it.grams)} g
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                {itemMacroLine(it)}
              </span>
            </li>
          ))}
        </ul>
      ) : meal.portions.length > 0 ? (
        // An AI dish — one card per ingredient, with its macros when stored.
        <ul className="flex flex-col gap-2">
          {meal.portions.map((p, i) => (
            <PortionRow key={i} portion={p} />
          ))}
        </ul>
      ) : (
        <p className="text-lg font-semibold">{meal.name}</p>
      )}

      <p className="text-xs font-medium text-[var(--muted)]">
        Meal total: {macroLine(prefs, meal)}
      </p>

      <div className="mt-1 flex gap-2">
        <button
          onClick={onEdit}
          disabled={busy}
          className="sc-btn sc-btn-soft flex-1"
        >
          <Pencil size={16} /> Edit
        </button>
        <button
          onClick={onRemove}
          disabled={busy}
          className="sc-btn sc-btn-neutral flex-1"
        >
          <Trash2 size={16} /> Remove
        </button>
      </div>
    </>
  );
}

function AiMeal({
  meal,
  prefs,
  busy,
  onError,
  onLog,
}: {
  meal: PlannedMeal;
  prefs: NutrientKey[];
  busy: boolean;
  onError: (msg: string) => void;
  onLog: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <AiMealEditor
        meal={meal}
        prefs={prefs}
        onError={onError}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <p className="text-lg font-semibold">{meal.name}</p>

      {meal.portions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {meal.portions.map((p, i) => (
            <PortionRow key={i} portion={p} />
          ))}
        </ul>
      )}

      {meal.why && <p className="text-sm text-[var(--muted)]">{meal.why}</p>}
      {meal.swaps.length > 0 && (
        <p className="text-xs text-[var(--muted)]">Swaps: {meal.swaps.join(" · ")}</p>
      )}

      <p className="text-xs font-medium text-[var(--muted)]">
        Meal total: {macroLine(prefs, meal)}
      </p>

      <div className="mt-1 flex gap-2">
        {meal.portions.length > 0 && (
          <button
            onClick={() => setEditing(true)}
            disabled={busy}
            className="sc-btn sc-btn-neutral flex-1"
          >
            <Pencil size={16} /> Edit
          </button>
        )}
        <button
          onClick={onLog}
          disabled={busy}
          className="sc-btn sc-btn-soft flex-1"
        >
          I ate this — log it
        </button>
      </div>
    </>
  );
}

// One portion mid-edit: its new grams, plus the per-gram macros captured from the
// stored portion so we can rescale exactly (linear in grams) without drift.
type PerGram = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  satfat_g: number;
  sodium_mg: number;
};

type EditPortion = {
  name: string;
  grams: number;
  per: PerGram | null;
};

// Grams the AI portioned it at → per-gram macros, or null when an old plan
// didn't store macros (then we can't rescale, and just keep the grams).
function toEdit(p: MealPortion): EditPortion {
  const per =
    p.kcal != null && p.grams > 0
      ? {
          kcal: p.kcal / p.grams,
          protein_g: (p.protein_g ?? 0) / p.grams,
          carbs_g: (p.carbs_g ?? 0) / p.grams,
          fat_g: (p.fat_g ?? 0) / p.grams,
          fiber_g: (p.fiber_g ?? 0) / p.grams,
          sugar_g: (p.sugar_g ?? 0) / p.grams,
          satfat_g: (p.satfat_g ?? 0) / p.grams,
          sodium_mg: (p.sodium_mg ?? 0) / p.grams,
        }
      : null;
  return { name: p.name, grams: p.grams, per };
}

// Rebuild a stored MealPortion from an edited one, rescaling macros to the new
// grams when we have a per-gram basis.
function fromEdit(e: EditPortion): MealPortion {
  if (!e.per) return { name: e.name, grams: e.grams };
  return {
    name: e.name,
    grams: e.grams,
    kcal: Math.round(e.per.kcal * e.grams),
    protein_g: Math.round(e.per.protein_g * e.grams),
    carbs_g: Math.round(e.per.carbs_g * e.grams),
    fat_g: Math.round(e.per.fat_g * e.grams),
    fiber_g: Math.round(e.per.fiber_g * e.grams),
    sugar_g: Math.round(e.per.sugar_g * e.grams),
    satfat_g: Math.round(e.per.satfat_g * e.grams),
    sodium_mg: Math.round(e.per.sodium_mg * e.grams),
  };
}

// Edit an AI dish: change each ingredient's grams or drop it. Macros rescale
// live from the grams; Save persists the new portions and re-sums the totals.
function AiMealEditor({
  meal,
  prefs,
  onError,
  onDone,
}: {
  meal: PlannedMeal;
  prefs: NutrientKey[];
  onError: (msg: string) => void;
  onDone: () => void;
}) {
  const [ports, setPorts] = useState<EditPortion[]>(() => meal.portions.map(toEdit));
  const [saving, startSave] = useTransition();

  function setGrams(i: number, grams: number) {
    const g = Math.max(0, Math.round(grams));
    setPorts((prev) => prev.map((p, j) => (j === i ? { ...p, grams: g } : p)));
  }

  // Add a pantry/scanned food to the dish as a new portion. Its per-gram macros
  // come from the food's per-100g values, so it rescales like the AI portions.
  function addFood(c: FoodChoice, grams: number) {
    setPorts((prev) => [
      ...prev,
      {
        name: c.name,
        grams,
        per: {
          kcal: c.kcal_100g / 100,
          protein_g: c.protein_100g / 100,
          carbs_g: c.carbs_100g / 100,
          fat_g: c.fat_100g / 100,
          fiber_g: c.fiber_100g / 100,
          sugar_g: c.sugar_100g / 100,
          satfat_g: c.satfat_100g / 100,
          sodium_mg: c.sodium_mg_100g / 100,
        },
      },
    ]);
  }

  const built = ports.map(fromEdit);
  const total = built.reduce<Macros>(
    (s, p) => ({
      kcal: s.kcal + (p.kcal ?? 0),
      protein_g: s.protein_g + (p.protein_g ?? 0),
      carbs_g: s.carbs_g + (p.carbs_g ?? 0),
      fat_g: s.fat_g + (p.fat_g ?? 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  function save() {
    onError("");
    startSave(async () => {
      try {
        await setMealPortions(meal.id, built);
        onDone();
      } catch (e) {
        onError(e instanceof Error ? e.message : "Couldn't save the meal.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg font-semibold">{meal.name}</p>

      {ports.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {ports.map((p, i) => (
            <li
              key={i}
              className="flex flex-col gap-2 rounded-2xl bg-[var(--fill-soft)] p-3"
            >
              <div className="flex items-center gap-1.5 font-medium">
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <button
                  onClick={() => setPorts((prev) => prev.filter((_, j) => j !== i))}
                  disabled={saving}
                  className="shrink-0 text-[var(--muted)] transition active:scale-90"
                  aria-label={`Remove ${p.name}`}
                >
                  <X size={16} />
                </button>
              </div>

              {p.per && (
                <span className="block text-xs text-[var(--muted)]">
                  {portionMacroLine(fromEdit(p))}
                </span>
              )}

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setGrams(i, p.grams - 25)}
                  disabled={saving || p.grams <= 0}
                  className="grid h-7 w-7 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90 disabled:opacity-40"
                  aria-label="Less"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  value={p.grams}
                  onChange={(e) => setGrams(i, Number(e.target.value))}
                  className="w-12 rounded-lg bg-[var(--fill)] py-1 text-center text-sm font-semibold tabular-nums outline-none"
                  aria-label={`${p.name} grams`}
                />
                <span className="text-xs text-[var(--muted)]">g</span>
                <button
                  onClick={() => setGrams(i, p.grams + 25)}
                  disabled={saving}
                  className="grid h-7 w-7 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90"
                  aria-label="More"
                >
                  <Plus size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          No ingredients left — saving will clear this meal.
        </p>
      )}

      <FoodSearchBox onPick={addFood} disabled={saving} />

      <p className="text-xs font-medium text-[var(--muted)]">
        Meal total: {macroLine(prefs, total)}
      </p>

      <div className="mt-1 flex gap-2">
        <button
          onClick={onDone}
          disabled={saving}
          className="sc-btn sc-btn-neutral flex-1"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="sc-btn sc-btn-soft flex-1"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

