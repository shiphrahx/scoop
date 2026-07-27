"use client";

import { useState, useTransition } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { saveCycling } from "./actions";
import { HIGH_DAYS_SAFE_MAX, HIGH_DAYS_SAFE_MIN } from "@/lib/highday";

// Refeed days. The user sets only two things: a master toggle and — within a
// safe range — how many refeed days a week (defaulting to the evidence-based 2).
// The carbs are CALCULATED, never typed: a refeed raises that day up to
// maintenance with extra carbs, and it's FREE (no other day is cut). The live
// preview shows the uplift and is honest that refeed weeks lose a little less.
export default function CyclingSettings({
  initial,
  recommended,
  base,
  maintenanceKcal,
  locked = false,
}: {
  initial: { enabled: boolean; highDaysPerWeek: number | null };
  recommended: number;
  // The flat deficit target this week. Null before onboarding sets one.
  base: { kcal: number } | null;
  // The user's maintenance estimate — the ceiling a refeed reaches. Null until
  // it's confidently known, in which case refeeds can't be sized yet.
  maintenanceKcal?: number | null;
  // Refeeds are locked during the calibration hold — no deficit yet. Show why
  // rather than hiding it.
  locked?: boolean;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  // null high_days_per_week means "follow the recommendation".
  const [useRecommended, setUseRecommended] = useState(initial.highDaysPerWeek == null);
  const [count, setCount] = useState(initial.highDaysPerWeek ?? recommended);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const effectiveCount = useRecommended ? recommended : count;

  // The extra carbs a refeed day carries: the whole gap up to maintenance, since
  // only carbs move. Mirrors the server maths (refeedCarbUpliftG) so the preview
  // is exact. Null maintenance → we can't size a refeed yet.
  const upliftCarbsG =
    base && maintenanceKcal != null
      ? Math.max(0, Math.round((maintenanceKcal - base.kcal) / 4))
      : null;

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
        <h2 className="text-lg font-semibold">Refeed days</h2>
        <p className="text-sm text-[var(--muted)]">
          Eat up to maintenance on a couple of chosen days to fuel workouts and
          refill glycogen. This unlocks once you finish calibrating and start your
          deficit — until then there&apos;s no deficit to take a break from.
        </p>
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col gap-4 sc-card p-5 text-left">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Refeed days</h2>
        <p className="text-sm text-[var(--muted)]">
          Eat up to maintenance on a few chosen days — extra carbs only, protein
          and fat unchanged. They&apos;re free: no other day is cut, so a refeed
          week loses a little less. They&apos;re for adherence and muscle, not
          faster fat loss.
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
          {/* Refeed days per week — the only number the user sets. */}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Refeed days per week</p>
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
              aria-label="Fewer refeed days"
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
              aria-label="More refeed days"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Calculated carbs — read-only. The app works these out; the user
              never types them. */}
          <div className="rounded-2xl bg-[var(--fill-soft)] p-4">
            <p className="font-medium">We&apos;ll do the carbs for you</p>
            {upliftCarbsG != null && maintenanceKcal != null ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                Each refeed day adds about{" "}
                <span className="font-semibold text-[var(--ink)]">
                  {upliftCarbsG} g carbs
                </span>{" "}
                (~{upliftCarbsG * 4} kcal) to reach your ~{maintenanceKcal} kcal
                maintenance. It&apos;s free — no other day is cut — so a week with
                refeeds loses a little less. Protein and fat stay the same.
              </p>
            ) : (
              <p className="mt-1 text-xs text-[var(--muted)]">
                We&apos;ll size your refeed days once we&apos;ve learned your
                maintenance from your results.
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
          "Save refeed days"
        )}
      </button>
    </section>
  );
}
