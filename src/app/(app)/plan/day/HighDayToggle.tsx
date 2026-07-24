"use client";

import { useState, useTransition } from "react";
import { Flame } from "lucide-react";
import { setHighDay } from "./actions";

// "Make this a high day" for the day being planned. Shows how many high days are
// left this week and blocks taking one when the allowance is spent. Only rendered
// when cycling is on (the page decides that); here we assume it's on.
export default function HighDayToggle({
  date,
  isHigh,
  remaining,
  allowance,
  surplusCarbsG,
}: {
  date?: string;
  isHigh: boolean;
  remaining: number;
  allowance: number;
  surplusCarbsG: number;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const noneLeft = !isHigh && remaining <= 0;

  function toggle() {
    setErr(null);
    startTransition(async () => {
      try {
        await setHighDay(date, !isHigh);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't update this day.");
      }
    });
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-2xl p-4"
      style={{
        background: isHigh ? "var(--tint-warm, var(--fill-soft))" : "var(--fill-soft)",
      }}
    >
      <div className="flex items-center gap-2">
        <Flame size={18} className="shrink-0 text-[var(--ink-teal)]" />
        <span className="font-semibold">
          {isHigh ? "This is a high day" : "High day"}
        </span>
      </div>

      <p className="text-sm text-[var(--muted)]">
        {isHigh
          ? `Today carries an extra ${surplusCarbsG} g of carbs — your low days cover it, so the week is unchanged.`
          : "A high day adds extra carbs to fuel a workout or a heavier day. Your other days give it back, so your weekly total doesn't move."}
      </p>

      <button
        onClick={toggle}
        disabled={pending || noneLeft}
        className={`sc-btn w-full py-3 ${isHigh ? "sc-btn-soft" : "sc-btn-primary"} disabled:opacity-50`}
      >
        {pending
          ? "Saving…"
          : isHigh
            ? "Make it a normal day"
            : noneLeft
              ? "No high days left this week"
              : "Make this a high day"}
      </button>

      {!isHigh && !noneLeft && (
        <p className="text-center text-xs text-[var(--muted)]">
          You still have {remaining} high day{remaining === 1 ? "" : "s"} left this week.
        </p>
      )}
      {noneLeft && (
        <p className="text-center text-xs text-[var(--muted)]">
          You&apos;ve used all {allowance} this week — this resets on Monday.
        </p>
      )}
      {err && (
        <p className="text-center text-xs font-medium text-[var(--danger,#e5484d)]">{err}</p>
      )}
    </section>
  );
}
