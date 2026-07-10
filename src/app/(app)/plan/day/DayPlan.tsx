"use client";

import { useEffect, useState, useTransition } from "react";
import { Sparkles, Check, X, Search, Plus, Minus, Package, Globe } from "lucide-react";
import type { FoodChoice, Macros, PlannedMeal, PlanItem } from "@/lib/types";
import { sumItems } from "@/lib/types";
import {
  searchFoods,
  setMealItems,
  clearSlot,
  planMyDay,
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

const macroLine = (m: Macros) =>
  `${Math.round(m.kcal)} kcal · P${Math.round(m.protein_g)} C${Math.round(
    m.carbs_g,
  )} F${Math.round(m.fat_g)}`;

export default function DayPlan({
  slots,
  target,
  connected,
}: {
  slots: Slot[];
  target: Macros | null;
  connected: boolean;
}) {
  const [busy, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const total = dayTotal(slots);
  const anyEmpty = slots.some((s) => !s.meal);

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
        <div className="sc-card flex items-center justify-around gap-2 p-4 text-center">
          <Stat label="kcal" value={total.kcal} of={target.kcal} />
          <Stat label="P" value={total.protein_g} of={target.protein_g} />
          <Stat label="C" value={total.carbs_g} of={target.carbs_g} />
          <Stat label="F" value={total.fat_g} of={target.fat_g} />
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
              <p className="text-xs text-[var(--muted)]">{macroLine(meal)}</p>
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-teal)]">
                <Check size={16} /> Eaten
              </p>
            </>
          ) : meal?.origin === "ai" ? (
            /* AI-suggested dish */
            <AiMeal meal={meal} busy={busy} onLog={() => run(() => logPlannedMeal(meal.id))} />
          ) : (
            /* Empty or user-built: pick a list of foods */
            <ItemPicker
              slot={slot}
              initial={meal?.items ?? []}
              mealId={meal?.id ?? null}
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

      {connected ? (
        anyEmpty && (
          <button
            onClick={() => run(() => planMyDay())}
            disabled={busy}
            className="sc-btn sc-btn-primary py-4 text-lg"
          >
            <Sparkles size={22} />
            {busy ? "Planning…" : "Plan my empty meals"}
          </button>
        )
      ) : (
        <p className="text-center text-sm text-[var(--muted)]">
          Connect your AI key in Settings to auto-fill empty meals from your pantry.
        </p>
      )}
    </section>
  );
}

// A user-built meal: a searchable list of foods (pantry first, then the web).
function ItemPicker({
  slot,
  initial,
  mealId,
  busy,
  onError,
  onLog,
}: {
  slot: string;
  initial: PlanItem[];
  mealId: string | null;
  busy: boolean;
  onError: (msg: string) => void;
  onLog?: () => void;
}) {
  const [items, setItems] = useState<PlanItem[]>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodChoice[]>([]);
  const [searching, setSearching] = useState(false);
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

  // Debounced search: pantry matches first, Open Food Facts as backup. All
  // state updates happen inside the timer (never synchronously in the effect).
  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(
      async () => {
        if (q.length < 2) {
          setResults([]);
          setSearching(false);
          return;
        }
        setSearching(true);
        try {
          setResults(await searchFoods(q));
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      },
      q.length < 2 ? 0 : 300,
    );
    return () => clearTimeout(t);
  }, [query]);

  function add(c: FoodChoice) {
    const grams = c.pack_size_g && c.pack_size_g <= 500 ? c.pack_size_g : 100;
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
      },
    ]);
    setQuery("");
    setResults([]);
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
                <span className="text-xs text-[var(--muted)]">
                  {macroLine(sumItems([it]))}
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
          placeholder="Add a food…"
          className="sc-input w-full pl-9"
        />

        {(searching || results.length > 0) && query.trim().length >= 2 && (
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
                      {Math.round(c.kcal_100g)} kcal/100g
                    </span>
                  </span>
                  <Plus size={16} className="shrink-0 text-[var(--muted)]" />
                </button>
              </li>
            ))}
            {!searching && results.length === 0 && (
              <li className="px-4 py-3 text-sm text-[var(--muted)]">No matches.</li>
            )}
          </ul>
        )}
      </div>

      {items.length > 0 && (
        <>
          <p className="text-xs font-medium text-[var(--muted)]">
            Meal total: {macroLine(total)}
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
  busy,
  onLog,
}: {
  meal: PlannedMeal;
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
      <p className="text-xs text-[var(--muted)]">{macroLine(meal)}</p>
      <button onClick={onLog} disabled={busy} className="sc-btn sc-btn-soft mt-1">
        I ate this — log it
      </button>
    </>
  );
}

function Stat({ label, value, of }: { label: string; value: number; of: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-lg font-bold tabular-nums leading-tight">
        {Math.round(value)}
      </span>
      <span className="text-xs text-[var(--muted)]">
        / {Math.round(of)} {label}
      </span>
    </div>
  );
}
