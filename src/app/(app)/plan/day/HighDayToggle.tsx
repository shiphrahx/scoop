"use client";

import { useState, useTransition } from "react";
import { Flame } from "lucide-react";
import { setHighDay } from "./actions";

// "Make this a refeed day" for the day being planned. Shows how many refeeds are
// left this week and blocks taking one when the count is spent. Only rendered
// when refeeds are available (the page decides that); here we assume they are.
export default function HighDayToggle({
  date,
  isHigh,
  remaining,
  allowance,
  upliftCarbsG,
}: {
  date?: string;
  isHigh: boolean;
  remaining: number;
  allowance: number;
  upliftCarbsG: number;
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
          {isHigh ? "This is a refeed day" : "Refeed day"}
        </span>
      </div>

      <p className="text-sm text-[var(--muted)]">
        {isHigh
          ? `Today is raised to maintenance, about ${upliftCarbsG} g more carbs. No other day is reduced to pay for it, so this week's deficit is slightly smaller.`
          : "A refeed day raises today to your maintenance calories, as extra carbohydrate only, to fuel a workout and refill glycogen. No other day is reduced to pay for it, so it supports adherence and training rather than faster fat loss."}
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
              ? "No refeed days left this week"
              : "Make this a refeed day"}
      </button>

      {!isHigh && !noneLeft && (
        <p className="text-center text-xs text-[var(--muted)]">
          You still have {remaining} refeed day{remaining === 1 ? "" : "s"} left this week.
        </p>
      )}
      {noneLeft && (
        <p className="text-center text-xs text-[var(--muted)]">
          You&apos;ve used all {allowance} this week. This resets on Monday.
        </p>
      )}
      {err && (
        <p className="text-center text-xs font-medium text-[var(--danger,#e5484d)]">{err}</p>
      )}
    </section>
  );
}
