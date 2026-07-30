import {
  UtensilsCrossed,
  Scale,
  CookingPot,
  Package,
  Telescope,
} from "lucide-react";
import ProgressRing from "@/components/ProgressRing";
import { NutrientBars } from "@/components/NutrientBreakdown";
import type { Macros } from "@/lib/types";
import type { NutrientKey } from "@/lib/nutrients";

// A phone-framed look at Home, built from the same ProgressRing and
// NutrientBars the app itself renders — so what visitors see on the landing
// page is what they get, not a drawing of it. Numbers are a sample day.
const TARGET: Macros = { kcal: 1898, protein_g: 160, carbs_g: 195, fat_g: 53 };
const COMMITTED: Macros = {
  kcal: 1078,
  protein_g: 96,
  carbs_g: 123,
  fat_g: 32,
};
const PREFS: NutrientKey[] = ["protein", "carbs", "fat"];

const quickActions = [
  { label: "Log food", icon: UtensilsCrossed },
  { label: "Log weight", icon: Scale },
  { label: "Batches", icon: CookingPot },
  { label: "Pantry", icon: Package },
];

export default function AppPreview() {
  const kcalLeft = Math.round(TARGET.kcal - COMMITTED.kcal);

  return (
    <div
      className="w-full max-w-[320px] rounded-[2.5rem] border-[10px] border-[#0f172a] bg-[var(--background)] p-4 shadow-2xl"
      // Decorative: the copy above already says everything this shows.
      aria-hidden
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs text-[var(--muted)]">Today</p>
            <p className="text-lg font-semibold">Hi, Sam</p>
          </div>
        </div>

        <section className="sc-card flex flex-col items-center gap-1 px-4 py-5">
          <ProgressRing
            value={COMMITTED.kcal}
            max={TARGET.kcal}
            size={168}
            stroke={15}
          >
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
                Calories left
              </p>
              <p className="text-4xl font-bold leading-tight tabular-nums">
                {kcalLeft}
              </p>
              <p className="text-xs text-[var(--muted)]">
                of {TARGET.kcal} kcal
              </p>
            </div>
          </ProgressRing>
          <p className="text-xs text-[var(--muted)]">778 eaten · 300 planned</p>
        </section>

        <section className="sc-card p-4">
          <NutrientBars prefs={PREFS} consumed={COMMITTED} target={TARGET} />
        </section>

        <section className="sc-card flex items-center gap-3 p-4">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-white"
            style={{ background: "var(--grad-cool)" }}
          >
            <Telescope size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Down 0.4 kg this week</p>
            <p className="truncate text-xs text-[var(--muted)]">
              Within the healthy range — targets unchanged
            </p>
          </div>
        </section>

        <div className="grid grid-cols-4 gap-2">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <div
                key={a.label}
                className="sc-card flex flex-col items-center gap-1 px-1 py-2.5"
              >
                <Icon size={17} className="text-[var(--ink-teal)]" />
                <span className="text-[9px] font-medium">{a.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
