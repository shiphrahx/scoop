"use client";

import { useState, useTransition } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { saveCycling } from "./actions";
import {
  HIGH_DAYS_SAFE_MAX,
  HIGH_DAYS_SAFE_MIN,
  computeSurplusCarbs,
  lowDayCarbDrop,
} from "@/lib/highday";

// Calorie/carb cycling ("high days"). The user sets only two things: a master
// toggle and — within a safe range — how many high days a week (defaulting to
// the goal-based recommendation). The carb amount is CALCULATED, never typed:
// the live preview shows how many carbs a high day adds and what each low day
// gives back, and warns when a guardrail has trimmed the surplus. The weekly
// total never changes.
export default function CyclingSettings({
  initial,
  recommended,
  base,
  locked = false,
}: {
  initial: { enabled: boolean; highDaysPerWeek: number | null };
  recommended: number;
  // The flat daily target this week — what the app cycles around. Null before
  // onboarding sets one, in which case there's nothing to preview yet.
  base: { kcal: number; carbs_g: number } | null;
  // Cycling is locked during the calibration hold — no deficit yet, nothing to
  // cycle around. Show why rather than hiding it.
  locked?: boolean;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  // null high_days_per_week means "follow the recommendation".
  const [useRecommended, setUseRecommended] = useState(initial.highDaysPerWeek == null);
  const [count, setCount] = useState(initial.highDaysPerWeek ?? recommended);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const effectiveCount = useRecommended ? recommended : count;
  const lowDays = 7 - effectiveCount;

  // The calculated surplus for the currently-chosen count, and whether a floor
  // trimmed it. Mirrors the server maths so the preview is exact.
  const { surplusCarbsG, capped } = base
    ? computeSurplusCarbs(base, effectiveCount)
    : { surplusCarbsG: 0, capped: false };
  const lowDrop = Math.round(lowDayCarbDrop(surplusCarbsG, effectiveCount));

  const dirty =
    enabled !== initial.enabled ||
    (useRecommended ? null : count) !== initial.highDaysPerWeek;

  function bumpCount(dir: -1 | 1) {
    setUseRecommended(false);
    setCount((c) =>
      Math.min(
        HIGH_DAYS_SAFE_MAX,
        Math.max(HIGH_DAYS_SAFE_MIN, (useRecommended ? recommended : c) + dir),
      ),
    );
    setSaved(false);
  }

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveCycling({
        enabled,
        highDaysPerWeek: useRecommended ? null : count,
      });
      setSaved(true);
    });
  }

  if (locked) {
    return (
      <section className="flex w-full flex-col gap-2 sc-card p-5 text-left">
        <h2 className="text-lg font-semibold">High days</h2>
        <p className="text-sm text-[var(--muted)]">
          Spread your week into a few higher-carb days and the rest lower. This
          unlocks once you finish calibrating and start your deficit — cycling an
          uncalibrated plan just pushes your carbs too low.
        </p>
      </section>
    );
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
          {/* High days per week — the only number the user sets. */}
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
              disabled={pending || effectiveCount <= HIGH_DAYS_SAFE_MIN}
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
              disabled={pending || effectiveCount >= HIGH_DAYS_SAFE_MAX}
              className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] transition active:scale-90 disabled:opacity-40"
              aria-label="More high days"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Calculated carbs — read-only. The app works these out; the user
              never types them. */}
          <div className="rounded-2xl bg-[var(--fill-soft)] p-4">
            <p className="font-medium">We&apos;ll do the carbs for you</p>
            {base ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                Each high day adds about{" "}
                <span className="font-semibold text-[var(--ink)]">
                  {surplusCarbsG} g carbs
                </span>{" "}
                (~{surplusCarbsG * 4} kcal). Your {lowDays} low day
                {lowDays === 1 ? "" : "s"} give back ~{lowDrop} g each, so the
                week is unchanged. Protein and fat stay the same every day.
              </p>
            ) : (
              <p className="mt-1 text-xs text-[var(--muted)]">
                Finish setting up your targets and we&apos;ll size your high days
                automatically.
              </p>
            )}
            {capped && (
              <p className="mt-2 text-xs font-medium text-[var(--ink-teal)]">
                Kept a little smaller so your low days stay above a safe level.
              </p>
            )}
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
