"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Check, X, Search, Plus, Minus, Package, PackagePlus, Globe, Trash2, Pencil, Pin, AlertTriangle, AlertCircle, CopyPlus, UtensilsCrossed, Info, Star, ScanBarcode, Sparkles, Apple } from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScannerLazy";
import type { FavouriteMeal, FoodChoice, Macros, MealPick, MealPortion, OffProduct, PlannedMeal, PlanItem, UnitOption } from "@/lib/types";
import { sumItems, sumMacros } from "@/lib/types";
import { mealToItems } from "@/lib/favourites";
import { pantryUnitLabel } from "@/lib/freshfoods";
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
import {
  searchFoods,
  searchReference,
  searchWeb,
  setMealItems,
  setMealPicks,
  setMealPortions,
  clearSlot,
  clearAppPlan,
  copyFromYesterday,
  copyMealFromSlot,
  logPlannedMeal,
  unlogPlannedMeal,
  removePlannedMeal,
  saveFavouriteMeal,
  addFavouriteMeal,
} from "./actions";

type Slot = { slot: string; meal: PlannedMeal | null };

// Sum every meal in the plan (built meals + AI dishes) for the day header. Sums
// the extra nutrients too (fibre, sugar, saturates, sodium), so a tracked one
// like fibre reads the real total instead of zero.
function dayTotal(slots: Slot[]): Macros {
  return sumMacros(
    slots.flatMap(({ meal }) => (meal ? [meal] : [])),
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

// How much of a portion to serve, as the user would measure it: a whole-unit
// count for a countable food ("2 bagels · 170 g"), a volume for a liquid unit
// ("250 ml"), or plain grams otherwise. Grams stays the real amount underneath.
function portionAmount(p: MealPortion): string {
  const grams = Math.round(p.grams);
  if (!p.unit_g || p.unit_g <= 0) return `${grams} g`;
  if (p.unit_label === "ml") return `${grams} ml`;
  const units = Math.round(grams / p.unit_g);
  return `${units} ${pluralUnit(p.unit_label ?? "unit", units)} · ${grams} g`;
}

// A countable food is one split into portions ("bagel", "portion"): it has a
// grams-per-portion. Liquids (ml) keep the grams stepper — a count reads oddly.
function isCountable(it: PlanItem): boolean {
  return !!it.unit_g && it.unit_g > 0 && it.unit_label !== "ml";
}

// How many whole portions the current grams work out to.
function itemUnits(it: PlanItem): number {
  return it.unit_g && it.unit_g > 0 ? Math.round(it.grams / it.unit_g) : 0;
}

// Pluralise a unit label for a count, but leave alone a label ending in a
// parenthetical ("pasta (cooked)" → "2 pasta (cooked)", not "…(cooked)s") or one
// already plural in its own name ("medium chips" → "2 medium chips", not
// "chipss").
function pluralUnit(label: string, count: number): string {
  const l = label.trim();
  if (count === 1 || l.endsWith(")") || l.endsWith("s")) return label;
  return `${label}s`;
}

// The portion word, singular or plural for a count ("bagel" / "bagels").
function unitWord(it: PlanItem, count: number): string {
  return pluralUnit(it.unit_label ?? "portion", count);
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
  favourites = [],
}: {
  slots: Slot[];
  target: Macros | null;
  prefs: NutrientKey[];
  date: string;
  favourites?: FavouriteMeal[];
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
          ) : meal?.origin === "ai" && meal.portions.length === 0 && meal.picks.length > 0 ? (
            /* Foods picked, grams not solved yet — waiting for "Build my day" */
            <PickedMeal meal={meal} date={date} />
          ) : meal?.origin === "ai" ? (
            /* An app-portioned dish */
            <AiMeal
              meal={meal}
              prefs={prefs}
              busy={busy}
              date={date}
              onError={setErr}
              onLog={() => run(() => logPlannedMeal(meal.id, date))}
            />
          ) : (
            /* Empty or user-built: pick a list of foods. Keyed on the meal id so
               a copied-in meal (new row) remounts with its items, rather than
               keeping this picker's empty state. */
            <>
              {!meal && (
                <>
                  <Link
                    href={`/plan/day/meal?slot=${encodeURIComponent(slot)}&date=${date}`}
                    className="sc-btn sc-btn-soft"
                  >
                    <UtensilsCrossed size={18} /> Plan this meal
                  </Link>
                  <CopySiblings
                    slots={slots}
                    slot={slot}
                    busy={busy}
                    onCopy={(from) => run(() => copyMealFromSlot(from, slot, date))}
                  />
                  <AddFromFavourites
                    favourites={favourites}
                    busy={busy}
                    onAdd={(favId) => run(() => addFavouriteMeal(favId, slot, date))}
                  />
                </>
              )}
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
            </>
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

// The one other meal a slot may copy from. Lunch and Dinner are the two
// interchangeable main meals, so each offers the other — dinner copies lunch,
// lunch copies dinner. Breakfast and snacks have no counterpart (their food
// doesn't transfer to a main meal), so they get no copy button.
const COPY_PARTNER: Record<string, string> = { lunch: "dinner", dinner: "lunch" };

// "Copy lunch" / "copy dinner" for an empty slot: a single button that copies
// this slot's counterpart meal, when that meal has anything planned — foods
// still being picked (picks), a hand-built list (items), or a portioned dish
// (portions). Copying brings the whole meal over, so a meal mid-plan can be
// duplicated before the day is built. Renders nothing when there's no
// counterpart, or the counterpart is empty.
function CopySiblings({
  slots,
  slot,
  busy,
  onCopy,
}: {
  slots: Slot[];
  slot: string;
  busy: boolean;
  onCopy: (fromSlot: string) => void;
}) {
  const partner = COPY_PARTNER[slot.toLowerCase()];
  const source = partner
    ? slots.find(
        (s) =>
          s.slot.toLowerCase() === partner &&
          s.meal != null &&
          (s.meal.picks.length > 0 ||
            s.meal.items.length > 0 ||
            s.meal.portions.length > 0),
      )
    : undefined;
  if (!source) return null;
  return (
    <button
      onClick={() => onCopy(source.slot)}
      disabled={busy}
      className="sc-btn sc-btn-soft"
    >
      <CopyPlus size={16} /> Copy {source.slot.toLowerCase()}
    </button>
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

// Search the pantry to pick a food, handing the chosen FoodChoice and the grams
// to use back to the parent. Shared by the meal builder and the AI-meal editor
// so both add foods the same way. Barcode scanning lives on the "plan this meal"
// screen, not here. Typing an
// amount with the item ("50g shreddies") sets the grams; otherwise the pack
// size (or 100 g) seeds it.
// Seed a sensible starting amount for a chosen food: the amount the user typed
// ("50g shreddies"), else one unit for a countable food (one bagel), else the
// pack size when it's a single serving, otherwise 100 g.
function seedGrams(c: FoodChoice, typed: number | null): number {
  return (
    typed ??
    (c.unit_g && c.unit_g > 0
      ? c.unit_g
      : c.pack_size_g && c.pack_size_g <= 500
        ? c.pack_size_g
        : 100)
  );
}

// The little heading that separates one search source from the next.
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <li className="border-t border-[var(--border)] bg-[var(--fill-soft)] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
      {children}
    </li>
  );
}

function FoodSearchBox({
  onPick,
}: {
  onPick: (c: FoodChoice, grams: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodChoice[]>([]);
  const [searching, setSearching] = useState(false);
  // Shared-reference results (a slice of cake, a cookie, a banana): the foods
  // with no barcode, held apart so they sit above the web. Open Food Facts is a
  // packaged-product database and answers "cake" with branded cake bars, so the
  // reference has to come first or the right answer is buried.
  const [refResults, setRefResults] = useState<FoodChoice[]>([]);
  const [refSearching, setRefSearching] = useState(false);
  // Web (Open Food Facts) results, kept apart from the pantry so the pantry
  // always shows first and the web search — which is slower — fills in behind it.
  const [webResults, setWebResults] = useState<FoodChoice[]>([]);
  const [webSearching, setWebSearching] = useState(false);
  // Type-in-the-macros fallback, for a food that's in neither the pantry nor OFF
  // (a coffee-shop treat, a homemade thing). Seeded with whatever's been typed.
  const [manualOpen, setManualOpen] = useState(false);
  // Barcode scan for a packaged item that isn't in the pantry — looked up on OFF
  // and added like any other food, so a scanned treat needs no typing.
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const parsed = useMemo(() => parseFoodQuery(query), [query]);

  // Look a scanned barcode up on Open Food Facts and add it as a food. The same
  // endpoint the pantry and meal-picker scanners use; a miss tells the user to
  // search or type the macros instead.
  async function handleScan(barcode: string) {
    setScanning(false);
    setScanNote("Looking up…");
    try {
      const res = await fetch(`/api/off/${encodeURIComponent(barcode)}`);
      if (!res.ok) {
        setScanNote(`No match for ${barcode}. Search or enter the macros instead.`);
        return;
      }
      const p = (await res.json()) as OffProduct;
      const c: FoodChoice = {
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
        unit_g: p.unit_g,
        unit_label: p.unit_label,
        unit_options: null,
      };
      onPick(c, seedGrams(c, null));
      setScanNote(`Added ${p.name}.`);
    } catch {
      setScanNote("Lookup failed. Search or enter the macros instead.");
    }
  }

  // Debounced search on the food name only. All state updates happen inside the
  // timer (never synchronously in the effect). The three sources run in
  // parallel; each writes its own state so the slowest never holds up the rest.
  useEffect(() => {
    const term = parsed.term;
    const t = setTimeout(
      async () => {
        if (term.length < 2) {
          setResults([]);
          setRefResults([]);
          setWebResults([]);
          setSearching(false);
          setRefSearching(false);
          setWebSearching(false);
          return;
        }
        setSearching(true);
        setRefSearching(true);
        setWebSearching(true);
        searchFoods(term)
          .then(setResults)
          .catch(() => setResults([]))
          .finally(() => setSearching(false));
        searchReference(term)
          .then(setRefResults)
          .catch(() => setRefResults([]))
          .finally(() => setRefSearching(false));
        searchWeb(term)
          .then(setWebResults)
          .catch(() => setWebResults([]))
          .finally(() => setWebSearching(false));
      },
      term.length < 2 ? 0 : 300,
    );
    return () => clearTimeout(t);
  }, [parsed.term]);

  function add(c: FoodChoice) {
    onPick(c, seedGrams(c, parsed.grams));
    setQuery("");
    setResults([]);
    setRefResults([]);
    setWebResults([]);
  }

  const searchingAny = searching || refSearching || webSearching;
  const anyResults =
    results.length > 0 || refResults.length > 0 || webResults.length > 0;
  const nothingYet = !searchingAny && !anyResults;

  // Where a hit came from, which decides its icon and the line under its name.
  // Not read off `c.source`: a reference food is stored as "off" (it has no
  // barcode and isn't a pantry item), so only the list it arrived in tells them
  // apart.
  type Kind = "pantry" | "ref" | "web";
  const ICON: Record<Kind, ReactNode> = {
    pantry: <Package size={15} className="shrink-0 text-[var(--ink-teal)]" />,
    ref: <Apple size={15} className="shrink-0 text-[var(--ink-teal)]" />,
    web: <Globe size={15} className="shrink-0 text-[var(--muted)]" />,
  };

  // The line under a hit's name. A typed amount wins ("50g shreddies" → "add
  // 50 g"). Otherwise a reference food shows the portion one tap actually adds —
  // "1 medium slice · 95 g · 352 kcal" — which is the whole point of it: the
  // user never learns what a slice of cake weighs, they just tap it.
  function detail(c: FoodChoice, kind: Kind): string {
    if (parsed.grams != null) return `add ${parsed.grams} g`;
    if (kind === "ref" && c.unit_g && c.unit_g > 0) {
      const kcal = Math.round((c.kcal_100g * c.unit_g) / 100);
      return `1 ${c.unit_label ?? "portion"} · ${Math.round(c.unit_g)} g · ${kcal} kcal`;
    }
    const per100 = `${Math.round(c.kcal_100g)} kcal/100g`;
    return kind === "pantry" ? `In your pantry · ${per100}` : per100;
  }

  function ResultRow({ c, i, kind }: { c: FoodChoice; i: number; kind: Kind }) {
    return (
      <li key={`${kind}-${c.off_barcode ?? c.name}-${i}`}>
        <button
          onClick={() => add(c)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-[var(--fill-soft)]"
        >
          {ICON[kind]}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {c.name}
              {c.brand ? (
                <span className="text-[var(--muted)]"> · {c.brand}</span>
              ) : null}
            </span>
            <span className="block text-xs text-[var(--muted)]">
              {detail(c, kind)}
            </span>
          </span>
          <Plus size={16} className="shrink-0 text-[var(--muted)]" />
        </button>
      </li>
    );
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

        {(searchingAny || anyResults) && parsed.term.length >= 2 && (
          <ul className="absolute z-10 mt-1 flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--glass-bg-solid)] shadow-lg">
            {results.map((c, i) => (
              <ResultRow key={`p-${i}`} c={c} i={i} kind="pantry" />
            ))}

            {/* Then the shared reference: everyday foods with no barcode, each
                offered at a real portion. Above the web on purpose — for "cake"
                or "cookie" this is the answer and Open Food Facts is noise. */}
            {refResults.length > 0 && <GroupLabel>Common foods</GroupLabel>}
            {refResults.map((c, i) => (
              <ResultRow key={`r-${i}`} c={c} i={i} kind="ref" />
            ))}

            {/* Web results last, behind a small divider so it's clear these
                come from Open Food Facts, not the user's shelves. */}
            {webResults.length > 0 && <GroupLabel>From the web</GroupLabel>}
            {webResults.map((c, i) => (
              <ResultRow key={`w-${i}`} c={c} i={i} kind="web" />
            ))}

            {searchingAny && !anyResults && (
              <li className="px-4 py-3 text-sm text-[var(--muted)]">Searching…</li>
            )}

            {nothingYet && (
              <li>
                <Link
                  href={`/pantry/add?name=${encodeURIComponent(parsed.term)}`}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-[var(--fill-soft)]"
                >
                  <PackagePlus size={15} className="shrink-0 text-[var(--ink-teal)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      No match found
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

      {manualOpen ? (
        <ManualMacros
          defaultName={parsed.term}
          onCancel={() => setManualOpen(false)}
          onAdd={(c) => {
            onPick(c, c.unit_g ?? 100);
            setManualOpen(false);
            setQuery("");
            setResults([]);
            setWebResults([]);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            onClick={() => {
              setScanNote(null);
              setScanning(true);
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-teal)]"
          >
            <ScanBarcode size={16} /> Scan a barcode
          </button>
          <button
            onClick={() => setManualOpen(true)}
            className="text-sm font-medium text-[var(--ink-teal)]"
          >
            Enter the macros
          </button>
        </div>
      )}

      {scanNote && (
        <p className="text-xs font-medium text-[var(--muted)]">{scanNote}</p>
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

// Type in a food's macros by hand — for a treat that's in neither the pantry nor
// Open Food Facts. The numbers entered are the macros of ONE portion of it, so
// they're stored as the per-100g values on a 100 g unit: adding one "portion"
// contributes exactly what was typed, and the stepper counts whole portions.
function ManualMacros({
  defaultName,
  onAdd,
  onCancel,
}: {
  defaultName: string;
  onAdd: (c: FoodChoice) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const num = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const valid = name.trim().length > 0 && num(kcal) > 0;

  function add() {
    onAdd({
      name: name.trim(),
      source: "off",
      off_barcode: null,
      brand: null,
      // The portion's macros live on a 100 g unit, so one unit == what was typed.
      kcal_100g: num(kcal),
      protein_100g: num(protein),
      carbs_100g: num(carbs),
      fat_100g: num(fat),
      fiber_100g: 0,
      sugar_100g: 0,
      satfat_100g: 0,
      sodium_mg_100g: 0,
      pack_size_g: null,
      unit_g: 100,
      unit_label: "portion",
      unit_options: null,
    });
  }

  const fields: [string, string, (v: string) => void][] = [
    ["Calories (kcal)", kcal, setKcal],
    ["Protein (g)", protein, setProtein],
    ["Carbs (g)", carbs, setCarbs],
    ["Fat (g)", fat, setFat],
  ];

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-[var(--fill-soft)] p-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Enter the macros for one portion
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="What is it? e.g. Blueberry muffin"
        className="sc-input w-full"
        autoFocus
      />
      <div className="grid grid-cols-2 gap-2">
        {fields.map(([label, value, set]) => (
          <label key={label} className="flex flex-col gap-1">
            <span className="text-xs text-[var(--muted)]">{label}</span>
            <input
              type="number"
              inputMode="decimal"
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder="0"
              className="sc-input w-full tabular-nums"
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="sc-btn sc-btn-neutral flex-1"
        >
          Cancel
        </button>
        <button
          onClick={add}
          disabled={!valid}
          className="sc-btn sc-btn-soft flex-1"
        >
          Add
        </button>
      </div>
    </div>
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

  // Hand this hand-built meal to the app to portion, adding a food the app will
  // size. The foods already in the meal are kept at the amounts the user set
  // (pinned), and the new food is added free, for the day solve to work out — so
  // "cereal bar plus however much protein powder fits" is one tap, then "Build my
  // day". This turns the slot from a manual meal into a picked one.
  function handToPlanner(food: FoodChoice) {
    const kept: MealPick[] = items.map((it) => ({
      name: it.name,
      source: it.source,
      off_barcode: it.off_barcode,
      kcal_100g: it.kcal_100g,
      protein_100g: it.protein_100g,
      carbs_100g: it.carbs_100g,
      fat_100g: it.fat_100g,
      fiber_100g: it.fiber_100g,
      sugar_100g: it.sugar_100g,
      satfat_100g: it.satfat_100g,
      sodium_mg_100g: it.sodium_mg_100g,
      pack_size_g: null,
      unit_g: it.unit_g ?? null,
      unit_label: it.unit_label ?? null,
      unit_options: it.unit_options ?? null,
      pinned_g: it.grams,
    }));
    const free: MealPick = {
      name: food.name,
      source: food.source,
      off_barcode: food.off_barcode,
      kcal_100g: food.kcal_100g,
      protein_100g: food.protein_100g,
      carbs_100g: food.carbs_100g,
      fat_100g: food.fat_100g,
      fiber_100g: food.fiber_100g,
      sugar_100g: food.sugar_100g,
      satfat_100g: food.satfat_100g,
      sodium_mg_100g: food.sodium_mg_100g,
      pack_size_g: food.pack_size_g,
      unit_g: food.unit_g ?? null,
      unit_label: food.unit_label ?? null,
      unit_options: food.unit_options ?? null,
      pinned_g: null,
    };
    startTransition(async () => {
      try {
        await setMealPicks(slot, [...kept, free], date);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Couldn't hand the meal to the app.");
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
        unit_g: c.unit_g ?? null,
        unit_label: c.unit_label ?? null,
        unit_options: c.unit_options ?? null,
      },
    ]);
  }

  function setGrams(i: number, grams: number) {
    const g = Math.max(0, Math.round(grams));
    save(items.map((it, j) => (j === i ? { ...it, grams: g } : it)));
  }

  // Set a countable food by a portion count: grams follow from grams-per-portion.
  function setUnits(i: number, units: number) {
    const it = items[i];
    const u = Math.max(0, Math.round(units));
    setGrams(i, u * (it.unit_g || 1));
  }

  // Switch a fresh food to one of its named sizes (small→large). The unit becomes
  // that size, and grams follow the current count at the new size (≥ one unit).
  function setSize(i: number, opt: UnitOption) {
    const it = items[i];
    const count = Math.max(1, itemUnits(it));
    save(
      items.map((x, j) =>
        j === i
          ? {
              ...x,
              unit_g: opt.grams,
              unit_label: pantryUnitLabel(x.name, opt.label),
              grams: count * opt.grams,
            }
          : x,
      ),
    );
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

              {/* Fresh food with named sizes: tap the size you have. */}
              {it.unit_options && it.unit_options.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {it.unit_options.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setSize(i, opt)}
                      disabled={busy}
                      data-active={it.unit_g === opt.grams}
                      className="sc-chip capitalize"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {isCountable(it) ? (
                /* Countable food: step in whole portions ("1 bagel", "2
                   portions"). Grams follow underneath — the user never weighs. */
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setUnits(i, itemUnits(it) - 1)}
                    disabled={busy || it.grams <= 0}
                    className="grid h-7 w-7 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90 disabled:opacity-40"
                    aria-label="One fewer"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="min-w-[5rem] text-center text-sm font-semibold tabular-nums">
                    {itemUnits(it)} {unitWord(it, itemUnits(it))}
                  </span>
                  <button
                    onClick={() => setUnits(i, itemUnits(it) + 1)}
                    disabled={busy}
                    className="grid h-7 w-7 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90"
                    aria-label="One more"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="text-xs text-[var(--muted)]">
                    ≈ {Math.round(it.grams)} g
                  </span>
                </div>
              ) : (
                /* Weighed food: the grams stepper. */
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setGrams(i, it.grams - 5)}
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
                    onClick={() => setGrams(i, it.grams + 5)}
                    disabled={busy}
                    className="grid h-7 w-7 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90"
                    aria-label="More"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
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

      <FoodSearchBox onPick={add} />

      {items.length > 0 && (
        <AppPortionAdd busy={busy} onAdd={handToPlanner} />
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
          <SaveFavourite defaultName={items.map((i) => i.name).join(", ")} items={items} />
        </>
      )}
    </div>
  );
}

// On a hand-built meal: add a food for the app to portion. Reveals a search
// box; picking a food hands the whole meal to the day solve, keeping the foods
// already there at the amounts the user set and letting the app work out how
// much of the new one to eat. That's the bridge from "I chose these" to "and the
// app sizes this last one" — e.g. a cereal bar you know, plus the right scoop of
// protein powder to fill the rest.
function AppPortionAdd({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (c: FoodChoice) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={busy}
        className="sc-btn sc-btn-neutral"
      >
        <Sparkles size={16} /> Add a food for the app to portion
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-[var(--fill-soft)] p-3">
      <p className="text-xs font-medium text-[var(--muted)]">
        Pick a food and the app works out how much of it to eat when you build
        your day. The foods above stay at the amounts you set.
      </p>
      <FoodSearchBox
        onPick={(c) => {
          onAdd(c);
          setOpen(false);
        }}
      />
      <button onClick={() => setOpen(false)} className="sc-btn sc-btn-neutral">
        Cancel
      </button>
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
          {portionAmount(portion)}
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

      <SaveFavourite defaultName={meal.name} items={mealToItems(meal)} />
    </>
  );
}

// Foods picked for a meal that hasn't been portioned yet: show what's chosen
// and where to change it. The grams arrive when the user taps "Build my day".
function PickedMeal({ meal, date }: { meal: PlannedMeal; date: string }) {
  const failed = meal.portions.length === 0 && meal.why != null;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        {meal.picks.map((p) => (
          <li key={p.name} className="sc-chip" data-active>
            {p.name}
          </li>
        ))}
      </ul>
      {failed ? (
        <p className="flex items-start gap-1.5 text-sm font-medium text-[var(--danger,#e5484d)]">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {meal.why}
        </p>
      ) : (
        <p className="flex items-start gap-1.5 text-sm text-[var(--muted)]">
          <Info size={16} className="mt-0.5 shrink-0" />
          Foods picked — tap <span className="font-semibold">Build my day</span>{" "}
          above and we&apos;ll work out the amounts.
        </p>
      )}
      <Link
        href={`/plan/day/meal?slot=${encodeURIComponent(meal.slot)}&date=${date}`}
        className="sc-btn sc-btn-soft"
      >
        <Pencil size={16} /> Change the foods
      </Link>
    </div>
  );
}

function AiMeal({
  meal,
  prefs,
  busy,
  date,
  onError,
  onLog,
}: {
  meal: PlannedMeal;
  prefs: NutrientKey[];
  busy: boolean;
  date: string;
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

      {meal.portions.length > 0 && (
        <SaveFavourite defaultName={meal.name} items={mealToItems(meal)} />
      )}

      {/* A meal built from picks can have its foods changed; the new picks
          wait for the next "Build my day". */}
      {meal.picks.length > 0 && (
        <Link
          href={`/plan/day/meal?slot=${encodeURIComponent(meal.slot)}&date=${date}`}
          className="text-center text-sm font-medium text-[var(--ink-teal)]"
        >
          Change the foods in this meal
        </Link>
      )}
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
  unit_g?: number | null;
  unit_label?: string | null;
};

// Match a portion to its pick the way the server does: case- and whitespace-
// insensitively, so a portion the build renamed off its pantry row ("tofu" pick
// → "Tofu" portion) still lines up.
const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

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
  return { name: p.name, grams: p.grams, per, unit_g: p.unit_g, unit_label: p.unit_label };
}

// Rebuild a stored MealPortion from an edited one, rescaling macros to the new
// grams when we have a per-gram basis.
function fromEdit(e: EditPortion): MealPortion {
  const unit = { unit_g: e.unit_g ?? null, unit_label: e.unit_label ?? null };
  if (!e.per) return { name: e.name, grams: e.grams, ...unit };
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
    ...unit,
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
  // The foods held at an amount the user set, by portion name. On save these are
  // the pinned foods: every rebalance holds them where the user left them and
  // re-solves the rest of the day around them.
  //
  // Seeded from the pins already on the picks, because saving is what writes the
  // whole set — start it empty and editing one ingredient would silently release
  // the hold on every other one in the dish. Matched case- and spacing-
  // insensitively, as the server does, so a portion the build renamed off its
  // pantry row still lines up with its pick.
  const [held, setHeld] = useState<Set<string>>(() => {
    const pinned = new Set(
      meal.picks.filter((p) => p.pinned_g != null).map((p) => normName(p.name)),
    );
    return new Set(
      meal.portions.filter((p) => pinned.has(normName(p.name))).map((p) => p.name),
    );
  });
  const hold = (name: string) =>
    setHeld((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));
  // Hand a food back to the app to size. The only way out of a hold, so it has
  // to be a visible tap rather than a side effect of saving.
  const release = (name: string) =>
    setHeld((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });

  function setGrams(i: number, grams: number) {
    const g = Math.max(0, Math.round(grams));
    setPorts((prev) => prev.map((p, j) => (j === i ? { ...p, grams: g } : p)));
    hold(ports[i].name);
  }

  // Set a countable portion by a whole count; grams follow grams-per-portion.
  function setUnits(i: number, unit_g: number, units: number) {
    setGrams(i, Math.max(0, Math.round(units)) * unit_g);
  }

  // Add a pantry/scanned food to the dish as a new portion. Its per-gram macros
  // come from the food's per-100g values, so it rescales like the AI portions.
  // A food the user added is one they chose an amount for, so it's held too.
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
        unit_g: c.unit_g ?? null,
        unit_label: c.unit_label ?? null,
      },
    ]);
    hold(c.name);
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
    const pinnedNames = built.filter((p) => held.has(p.name)).map((p) => p.name);
    startSave(async () => {
      try {
        await setMealPortions(meal.id, built, pinnedNames);
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

              {/* A held food keeps this amount through every rebalance. Saying
                  so here, next to the number, is the only place the hold is
                  visible — and the only way to hand the food back to the app. */}
              {held.has(p.name) && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="flex items-center gap-1 font-medium text-[var(--muted)]">
                    <Pin size={12} /> Held at your amount
                  </span>
                  <button
                    onClick={() => release(p.name)}
                    disabled={saving}
                    className="font-semibold text-[var(--ink-teal)] underline underline-offset-2 transition active:scale-95"
                  >
                    Let the app size it
                  </button>
                </div>
              )}

              {p.unit_g && p.unit_g > 0 && p.unit_label !== "ml" ? (
                /* Countable portion: whole units only, never a part of one. */
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setUnits(i, p.unit_g!, Math.round(p.grams / p.unit_g!) - 1)}
                    disabled={saving || p.grams <= 0}
                    className="grid h-7 w-7 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90 disabled:opacity-40"
                    aria-label="One fewer"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="min-w-[5rem] text-center text-sm font-semibold tabular-nums">
                    {Math.round(p.grams / p.unit_g)}{" "}
                    {pluralUnit(p.unit_label ?? "portion", Math.round(p.grams / p.unit_g))}
                  </span>
                  <button
                    onClick={() => setUnits(i, p.unit_g!, Math.round(p.grams / p.unit_g!) + 1)}
                    disabled={saving}
                    className="grid h-7 w-7 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90"
                    aria-label="One more"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="text-xs text-[var(--muted)]">
                    ≈ {Math.round(p.grams)} g
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setGrams(i, p.grams - 5)}
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
                    onClick={() => setGrams(i, p.grams + 5)}
                    disabled={saving}
                    className="grid h-7 w-7 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90"
                    aria-label="More"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          No ingredients left — saving will clear this meal.
        </p>
      )}

      <FoodSearchBox onPick={addFood} />

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

// "Save as favourite" for a meal: a button that opens a name box, then saves the
// meal's foods under that name so it can be dropped into any slot later. Shows a
// brief "Saved" once done. Collapses back so it never crowds the meal card.
function SaveFavourite({
  defaultName,
  items,
}: {
  defaultName: string;
  items: PlanItem[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  if (saved) {
    return (
      <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-[var(--ink-teal)]">
        <Check size={16} /> Saved to favourites
      </p>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setName(defaultName);
          setOpen(true);
        }}
        className="sc-btn sc-btn-neutral"
      >
        <Star size={16} /> Save as favourite
      </button>
    );
  }

  function save() {
    setErr(null);
    startSave(async () => {
      try {
        await saveFavouriteMeal(name, items);
        setSaved(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't save it.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-[var(--fill-soft)] p-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Name this favourite
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Chicken & rice bowl"
        className="sc-input w-full"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          disabled={saving}
          className="sc-btn sc-btn-neutral flex-1"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving || name.trim().length === 0}
          className="sc-btn sc-btn-soft flex-1"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {err && (
        <p className="text-sm font-medium text-[var(--danger,#e5484d)]">{err}</p>
      )}
    </div>
  );
}

// "Add from favourites" on an empty slot: a button that opens the list of the
// user's saved meals, each tappable to drop it into this slot. Renders nothing
// when there are no favourites yet.
function AddFromFavourites({
  favourites,
  busy,
  onAdd,
}: {
  favourites: FavouriteMeal[];
  busy: boolean;
  onAdd: (favId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (favourites.length === 0) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="sc-btn sc-btn-soft">
        <Star size={18} /> Add from favourites
      </button>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {favourites.map((f) => (
        <li key={f.id}>
          <button
            onClick={() => {
              setOpen(false);
              onAdd(f.id);
            }}
            disabled={busy}
            className="flex w-full items-center gap-2 rounded-2xl bg-[var(--fill-soft)] p-3 text-left transition active:scale-[0.99] disabled:opacity-40"
          >
            <Star size={16} className="shrink-0 text-[var(--ink-teal)]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{f.name}</span>
              <span className="block text-xs text-[var(--muted)]">
                {Math.round(f.kcal)} kcal · Protein {Math.round(f.protein_g)} g ·
                Carbs {Math.round(f.carbs_g)} g · Fat {Math.round(f.fat_g)} g
              </span>
            </span>
            <Plus size={16} className="shrink-0 text-[var(--muted)]" />
          </button>
        </li>
      ))}
    </ul>
  );
}

