// Shared nutrient display, driven by the user's chosen nutrient set so the
// Plan-my-day breakdown, the Add-food readout and the Home bars all show the
// same nutrients with the same clear labels and units.

import {
  NUTRIENTS,
  valueOf,
  formatNutrient,
  nutrientFit,
  type FitStatus,
  type NutrientKey,
} from "@/lib/nutrients";
import type { Macros } from "@/lib/types";

// One colour per verdict: on target, drifting, needs changing.
export const FIT_TEXT: Record<FitStatus, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  off: "text-rose-600",
};

// "+12 g" / "−80" — how far this nutrient sits from its target.
function diffLabel(diff: number, key: NutrientKey): string {
  const sign = diff > 0 ? "+" : "−";
  return `${sign}${formatNutrient(Math.abs(diff), key)}`;
}

// A compact "value / target unit" tile per nutrient, kcal first. `consumed` is
// whatever total you're showing (eaten today, or a plan's running total).
// With `showFit`, each tile is coloured by how close it lands on target and
// shows the miss underneath — used when planning, where the point is to hit it.
export function NutrientStats({
  prefs,
  consumed,
  target,
  showFit = false,
}: {
  prefs: NutrientKey[];
  consumed: Macros;
  target?: Macros | null;
  showFit?: boolean;
}) {
  const keys: NutrientKey[] = ["kcal", ...prefs];
  return (
    <div className="grid grid-cols-4 gap-x-2 gap-y-3 text-center sm:grid-cols-5">
      {keys.map((key) => {
        const def = NUTRIENTS[key];
        const value = Math.round(valueOf(consumed, key));
        const tgt = target ? Math.round(valueOf(target, key)) : null;
        const fit = showFit ? nutrientFit(consumed, target, key) : null;
        return (
          <div key={key} className="flex flex-col">
            <span
              className={`text-lg font-bold tabular-nums leading-tight ${fit ? FIT_TEXT[fit.status] : ""}`}
            >
              {value}
            </span>
            <span className="text-[11px] leading-tight text-[var(--muted)]">
              {tgt != null && tgt > 0 ? `/ ${tgt}${def.unit === "kcal" ? "" : ` ${def.unit}`}` : def.unit === "kcal" ? "kcal" : def.unit}
            </span>
            <span className="mt-0.5 text-xs font-semibold">{def.label}</span>
            {fit && fit.status !== "ok" && (
              <span
                className={`text-[11px] font-semibold leading-tight tabular-nums ${FIT_TEXT[fit.status]}`}
              >
                {diffLabel(fit.diff, key)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// A labelled progress bar per chosen nutrient (kcal excluded — it's the ring).
export function NutrientBars({
  prefs,
  consumed,
  target,
}: {
  prefs: NutrientKey[];
  consumed: Macros;
  target: Macros;
}) {
  return (
    <div className="flex flex-col gap-4">
      {prefs.map((key) => {
        const def = NUTRIENTS[key];
        const c = valueOf(consumed, key);
        const t = valueOf(target, key);
        const pct = t > 0 ? Math.min(100, (c / t) * 100) : 0;
        const over = t > 0 && c > t;
        // For a limit (sugar/sodium/…) going over is the warning; for a goal
        // it just means "hit". Same bar, wording differs.
        const remaining = Math.max(0, Math.round(t - c));
        return (
          <div key={key}>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-semibold">{def.label}</span>
              <span className="text-[var(--muted)]">
                {over ? (
                  <span
                    className={`font-semibold ${def.kind === "limit" ? "text-amber-600" : "text-[var(--foreground)]"}`}
                  >
                    {formatNutrient(c - t, key)} over
                  </span>
                ) : (
                  <>
                    <span className="font-semibold text-[var(--foreground)]">
                      {formatNutrient(remaining, key)}
                    </span>{" "}
                    left
                  </>
                )}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[var(--fill)]">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${pct}%`, background: def.gradient }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
