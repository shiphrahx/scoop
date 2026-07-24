"use client";

import { useState, useTransition } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { saveCycling } from "./actions";
import { lowDayCarbDrop } from "@/lib/highday";

const COUNT_MIN = 1;
const COUNT_MAX = 6;
const SURPLUS_MIN = 15;
const SURPLUS_MAX = 300;
const SURPLUS_STEP = 15;

// Calorie/carb cycling ("high days"). A master toggle, the number of high days
// a week (defaulting to the goal-based recommendation), and how many extra carbs
// a high day carries. The weekly total never changes — the copy says so, and the
// live preview shows what each low day gives back to keep it balanced.
export default function CyclingSettings({
  initial,
  recommended,
}: {
  initial: { enabled: boolean; highDaysPerWeek: number | null; surplusCarbsG: number };
  recommended: number;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  // null high_days_per_week means "follow the recommendation".
  const [useRecommended, setUseRecommended] = useState(initial.highDaysPerWeek == null);
  const [count, setCount] = useState(initial.highDaysPerWeek ?? recommended);
  const [surplus, setSurplus] = useState(initial.surplusCarbsG);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const effectiveCount = useRecommended ? recommended : count;
  const lowDrop = Math.round(lowDayCarbDrop(surplus, effectiveCount));
  const lowDays = 7 - effectiveCount;

  const dirty =
    enabled !== initial.enabled ||
    (useRecommended ? null : count) !== initial.highDaysPerWeek ||
    surplus !== initial.surplusCarbsG;

  function bumpCount(dir: -1 | 1) {
    setUseRecommended(false);
    setCount((c) => Math.min(COUNT_MAX, Math.max(COUNT_MIN, (useRecommended ? recommended : c) + dir)));
    setSaved(false);
  }

  function bumpSurplus(dir: -1 | 1) {
    setSurplus((s) => Math.min(SURPLUS_MAX, Math.max(SURPLUS_MIN, s + dir * SURPLUS_STEP)));
    setSaved(false);
  }

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveCycling({
        enabled,
        highDaysPerWeek: useRecommended ? null : count,
        surplusCarbsG: surplus,
      });
      setSaved(true);
    });
  }

  return (
    <section className="flex w-full flex-col gap-4 sc-card p-5 text-left">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">High days</h2>
        <p className="text-sm text-[var(--muted)]">
          Spread your week into a few higher-carb days and the rest lower. Your
          weekly total stays exactly the same — it just moves around.
        </p>
      </div>

      {/* Master toggle */}
      <button
        onClick={() => {
          setEnabled((v) => !v);
          setSaved(false);
        }}
        role="switch"
        aria-checked={enabled}
        className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--fill-soft)] px-4 py-3 text-left"
      >
        <span className="font-medium">{enabled ? "On" : "Off"}</span>
        <span
          className="relative h-7 w-12 shrink-0 rounded-full transition"
          style={{ background: enabled ? "var(--grad-primary)" : "var(--fill)" }}
        >
          <span
            className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all"
            style={{ left: enabled ? "1.5rem" : "0.25rem" }}
          />
        </span>
      </button>

      {enabled && (
        <>
          {/* High days per week */}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">High days per week</p>
              <p className="text-xs text-[var(--muted)]">
                Recommended for your goal: {recommended}
                {!useRecommended && count !== recommended && (
                  <>
                    {" · "}
                    <button
                      onClick={() => {
                        setUseRecommended(true);
                        setSaved(false);
                      }}
                      className="font-semibold text-[var(--ink-teal)] underline"
                    >
                      use recommended
                    </button>
                  </>
                )}
              </p>
            </div>
            <button
              onClick={() => bumpCount(-1)}
              disabled={pending || effectiveCount <= COUNT_MIN}
              className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90 disabled:opacity-40"
              aria-label="Fewer high days"
            >
              <Minus size={16} />
            </button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums">
              {effectiveCount}
            </span>
            <button
              onClick={() => bumpCount(1)}
              disabled={pending || effectiveCount >= COUNT_MAX}
              className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90 disabled:opacity-40"
              aria-label="More high days"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Extra carbs on a high day */}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Extra carbs on a high day</p>
              <p className="text-xs text-[var(--muted)]">
                Each of your {lowDays} low day{lowDays === 1 ? "" : "s"} gives back
                ~{lowDrop} g.
              </p>
            </div>
            <button
              onClick={() => bumpSurplus(-1)}
              disabled={pending || surplus <= SURPLUS_MIN}
              className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90 disabled:opacity-40"
              aria-label="Fewer extra carbs"
            >
              <Minus size={16} />
            </button>
            <span className="w-14 text-center text-sm font-semibold tabular-nums">
              {surplus} g
            </span>
            <button
              onClick={() => bumpSurplus(1)}
              disabled={pending || surplus >= SURPLUS_MAX}
              className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90 disabled:opacity-40"
              aria-label="More extra carbs"
            >
              <Plus size={16} />
            </button>
          </div>
        </>
      )}

      <button
        onClick={save}
        disabled={pending || (!dirty && !saved)}
        className="sc-btn sc-btn-primary w-full py-3"
      >
        {pending ? (
          "Saving…"
        ) : saved && !dirty ? (
          <>
            <Check size={18} /> Saved
          </>
        ) : (
          "Save high days"
        )}
      </button>
    </section>
  );
}
