"use client";

import { useState, useTransition } from "react";
import { Scale, Sparkles } from "lucide-react";
import { buildMyDay } from "./actions";

// The one button that turns picks into portions: solves every picked meal
// together so the day lands on its macros. Once everything picked is built it
// reads as "Rebalance" — run it again after edits to re-portion the same picks.
export default function BuildDayCard({
  date,
  mode,
}: {
  date?: string;
  mode: "build" | "rebalance";
}) {
  const [busy, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    startTransition(async () => {
      try {
        await buildMyDay(date);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't build your day.");
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
    </div>
  );
}
