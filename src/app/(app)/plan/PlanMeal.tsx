"use client";

import { useState, useTransition } from "react";
import { Sparkles, Check, ArrowRight } from "lucide-react";
import type { MealSuggestion } from "@/lib/types";
import { getSuggestions, logSuggestion } from "./actions";

// Build a meal by tapping: pick a carb → pick a protein → get dishes that use
// your pantry, fit your diet, and come with exact portions for today's macros.
// The carb/protein steps are optional shortcuts — you can just tap Suggest.
export default function PlanMeal({ pantry }: { pantry: string[] }) {
  const [carb, setCarb] = useState<string | null>(null);
  const [protein, setProtein] = useState<string | null>(null);
  const [meals, setMeals] = useState<MealSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [logged, setLogged] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function suggest() {
    setLoading(true);
    setNote("Thinking up dishes…");
    try {
      const found = await getSuggestions(carb, protein);
      setMeals(found);
      setLogged(new Set());
      setNote(found.length ? null : "No dishes fit right now. Add pantry items.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't get ideas.");
    } finally {
      setLoading(false);
    }
  }

  const hasPantry = pantry.length > 0;

  return (
    <section className="flex flex-col gap-4">
      {hasPantry && (
        <>
          <TilePicker
            step="1"
            label="Pick a carb"
            options={pantry}
            selected={carb}
            onSelect={(v) => setCarb((c) => (c === v ? null : v))}
          />
          <TilePicker
            step="2"
            label="Pick a protein"
            options={pantry}
            selected={protein}
            onSelect={(v) => setProtein((p) => (p === v ? null : v))}
          />
        </>
      )}

      <button
        onClick={suggest}
        disabled={loading}
        className="sc-btn sc-btn-primary py-4 text-lg"
      >
        <Sparkles size={22} />
        {loading ? "Thinking…" : meals ? "New ideas" : "Suggest a meal"}
      </button>

      {!hasPantry && !meals && (
        <p className="text-center text-sm text-[var(--muted)]">
          Add a few pantry items first for the best ideas.
        </p>
      )}

      {note && (
        <p className="text-center text-sm font-medium text-[var(--muted)]">
          {note}
        </p>
      )}

      {meals && meals.length > 0 && (
        <ul className="flex flex-col gap-3">
          {meals.map((m, i) => (
            <li key={i} className="flex flex-col gap-2 sc-card p-4">
              <p className="text-lg font-semibold">{m.name}</p>
              <p className="text-sm text-[var(--muted)]">{m.why}</p>

              {m.portions.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-2xl bg-[rgba(15,23,42,0.03)] p-3 text-sm">
                  {m.portions.map((p, pi) => (
                    <li key={pi} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {Math.round(p.grams)} g
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {m.swaps.length > 0 && (
                <p className="text-xs text-[var(--muted)]">
                  Swaps: {m.swaps.join(" · ")}
                </p>
              )}

              <p className="text-xs text-[var(--muted)]">
                {Math.round(m.kcal)} kcal · P{Math.round(m.protein_g)} C
                {Math.round(m.carbs_g)} F{Math.round(m.fat_g)}
              </p>
              <button
                disabled={logged.has(i)}
                onClick={() =>
                  startTransition(async () => {
                    await logSuggestion(m);
                    setLogged((prev) => new Set(prev).add(i));
                  })
                }
                className="sc-btn sc-btn-soft mt-1"
              >
                {logged.has(i) ? (
                  <>
                    <Check size={16} /> Logged
                  </>
                ) : (
                  "I made this — log it"
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TilePicker({
  step,
  label,
  options,
  selected,
  onSelect,
}: {
  step: string;
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[rgba(20,184,166,0.14)] text-xs text-[#0f766e]">
          {step}
        </span>
        {label}
        {selected && (
          <span className="ml-auto inline-flex items-center gap-1 text-[#0f766e]">
            {selected} <ArrowRight size={14} />
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            data-active={selected === opt}
            className="sc-chip"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
