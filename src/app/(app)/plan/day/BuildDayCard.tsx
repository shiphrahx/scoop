"use client";

import { useState, useTransition } from "react";
import { Scale, Sparkles, AlertCircle } from "lucide-react";
import { buildMyDay, applyDayFix, type DayFix } from "./actions";

// The one button that turns picks into portions: solves every picked meal
// together so the day lands on its macros. Once everything picked is built it
// reads as "Rebalance" — run it again after edits to re-portion the same picks.
//
// When the solve is stuck over a ceiling — the picks can't go any smaller, so a
// plain rebalance changes nothing and reads as a broken button — it explains the
// problem and offers a concrete fix (drop the food that's over), which the app
// only carries out if the user says yes.
export default function BuildDayCard({
  date,
  mode,
}: {
  date?: string;
  mode: "build" | "rebalance";
}) {
  const [busy, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [fix, setFix] = useState<DayFix | null>(null);

  // Turn a build/rebalance result into the line under the button, and surface
  // any fix it offered.
  function show(r: Awaited<ReturnType<typeof buildMyDay>>) {
    setFix(r.fix);
    if (r.changed) {
      setResult(`Rebalanced — ${r.moves.join(", ")}.`);
    } else if (r.fix) {
      // A stuck day speaks through the fix prompt, not this line.
      setResult(null);
    } else if (r.held.length > 0) {
      setResult(
        `Nothing moved: ${r.held.join(", ")} ${r.held.length === 1 ? "is" : "are"} held at the amount you set. Press again to free ${r.held.length === 1 ? "it" : "them"}.`,
      );
    } else {
      setResult("Nothing moved — this is the closest these picks get today.");
    }
  }

  function run() {
    setErr(null);
    setResult(null);
    setFix(null);
    startTransition(async () => {
      try {
        show(await buildMyDay(date));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't build your day.");
      }
    });
  }

  // The user said yes to the offered fix: drop the named foods and rebalance.
  function acceptFix() {
    if (!fix) return;
    setErr(null);
    setResult(null);
    const drops = fix.drops;
    setFix(null);
    startTransition(async () => {
      try {
        const r = await applyDayFix(drops, date);
        show(r);
        if (r.changed && !r.fix) {
          setResult("Dropped what didn't fit and re-portioned your day.");
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't fix your day.");
      }
    });
  }

  const build = mode === "build";
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={run}
        disabled={busy}
        className="flex items-center gap-3 rounded-[1.75rem] p-5 text-left text-white transition active:scale-[0.99] disabled:opacity-70"
        style={{ background: "var(--grad-primary)", boxShadow: "var(--shadow-glow)" }}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/20">
          {build ? <Sparkles size={22} /> : <Scale size={22} />}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">
            {busy ? "Working it out…" : build ? "Build my day" : "Rebalance my day"}
          </span>
          <span className="block truncate text-sm text-white/80">
            {build
              ? "Portion every planned meal to hit today's macros"
              : "Re-portion your picked meals around your edits"}
          </span>
        </span>
      </button>

      {err && (
        <p className="text-center text-sm font-medium text-[var(--danger,#e5484d)]">
          {err}
        </p>
      )}

      {!err && fix && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--fill-soft)] p-4">
          <p className="flex items-start gap-2 text-sm font-medium">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-[var(--warn,#f5a623)]" />
            <span>
              {fix.reason} {fix.summary}
            </span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={acceptFix}
              disabled={busy}
              className="sc-btn sc-btn-soft flex-1"
            >
              {busy ? "Fixing…" : "Yes, fix it"}
            </button>
            <button
              onClick={() => setFix(null)}
              disabled={busy}
              className="sc-btn sc-btn-neutral flex-1"
            >
              Leave it
            </button>
          </div>
        </div>
      )}

      {!err && !fix && result && (
        <p className="text-center text-sm text-[var(--muted)]">{result}</p>
      )}
    </div>
  );
}
