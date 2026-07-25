"use client";

// Adherence: did the plan get followed?
//
// This tab exists so a stall can be diagnosed instead of guessed at. If the
// target was hit most days and the scale still didn't move, the target is wrong;
// if it wasn't, the target was never tested. Those need opposite fixes, and the
// scale alone can't tell them apart.

import { CalendarClock, Flame } from "lucide-react";
import { CompareBars, WeeklyIntakeChart } from "@/components/Charts";
import type { WeekCompare, WeekdayWeekend } from "@/lib/insights";
import type { NonScaleVictory } from "@/lib/types";
import VictoriesCard from "./VictoriesCard";
import {
  CompactCard,
  Expandable,
  Hero,
  InsightGrid,
  fmt,
  signed,
  type LockedInsight,
} from "./ui";

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

export default function AdherenceTab({
  weeks,
  pattern,
  victories,
  today,
}: {
  weeks: WeekCompare[];
  pattern: WeekdayWeekend | null;
  victories: NonScaleVictory[];
  today: string;
}) {
  const latest = weeks.length > 0 ? weeks[weeks.length - 1] : null;
  const locked: LockedInsight[] = [];

  if (weeks.length === 0) {
    locked.push({
      title: "Eaten vs target",
      why: "Log food for a week that has a target on it.",
    });
  }
  if (pattern == null) {
    locked.push({
      title: "Weekdays vs weekends",
      why: "Six weekdays and three weekend days of food logging are needed to compare them.",
    });
  }

  return (
    <InsightGrid locked={locked}>
      {latest != null ? (
        <CompactCard
          icon={<Flame size={16} />}
          title="Eaten vs target"
          detail={
            <>
              <WeeklyIntakeChart
                data={weeks.map((w) => ({
                  weekStart: w.weekStart,
                  actual: w.actual.kcal,
                  target: w.target.kcal,
                }))}
              />
              <Expandable label={`Macros for the week of ${shortDate(latest.weekStart)}`}>
                <div className="flex flex-col gap-2">
                  {(
                    [
                      ["Calories", "kcal", latest.actual.kcal, latest.target.kcal, latest.delta.kcal],
                      ["Protein", "g", latest.actual.protein_g, latest.target.protein_g, latest.delta.protein_g],
                      ["Carbs", "g", latest.actual.carbs_g, latest.target.carbs_g, latest.delta.carbs_g],
                      ["Fat", "g", latest.actual.fat_g, latest.target.fat_g, latest.delta.fat_g],
                    ] as const
                  ).map(([label, unit, actual, target, delta]) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between rounded-xl bg-[var(--fill-soft)] px-3 py-2 text-sm"
                    >
                      <span className="text-[var(--muted)]">{label}</span>
                      <span className="tabular-nums">
                        {actual} / {target} {unit}
                        <span
                          className="ml-2 font-semibold"
                          style={{
                            color:
                              Math.abs(delta) <= Math.max(5, target * 0.05)
                                ? "var(--ink-green)"
                                : "var(--accent)",
                          }}
                        >
                          {signed(delta, 0)}
                        </span>
                      </span>
                    </div>
                  ))}
                  <p className="text-xs text-[var(--muted)]">
                    Averaged over the {latest.loggedDays} day
                    {latest.loggedDays === 1 ? "" : "s"} you logged that week.
                  </p>
                </div>
              </Expandable>
            </>
          }
        >
          <Hero
            size="sm"
            value={signed(latest.delta.kcal, 0)}
            unit="kcal"
            label={`vs target, week of ${shortDate(latest.weekStart)}`}
            tone={
              Math.abs(latest.delta.kcal) <= Math.max(5, latest.target.kcal * 0.05)
                ? "good"
                : "warn"
            }
          />
        </CompactCard>
      ) : null}

      {pattern != null ? (
        <CompactCard
          icon={<CalendarClock size={16} />}
          title="Weekdays vs weekends"
          detail={
            <>
              <CompareBars
                unit="kcal / day"
                rows={[
                  {
                    label: `Weekdays (${pattern.weekdayDays} days)`,
                    value: pattern.weekdayMeanKcal,
                    tint: "teal",
                  },
                  {
                    label: `Weekends (${pattern.weekendDays} days)`,
                    value: pattern.weekendMeanKcal,
                    tint: "violet",
                  },
                ]}
              />
              <p className="text-sm text-[var(--muted)]">
                {pattern.pattern === "even"
                  ? "Your weekends look like your weekdays. That consistency is doing a lot of the work."
                  : pattern.pattern === "bigger-weekends"
                    ? `Weekends run ${fmt(pattern.differenceKcal, 0)} kcal a day higher — about ${fmt(pattern.weeklyCostKcal, 0)} kcal a week, which is most of a day's deficit.`
                    : `Weekdays run ${fmt(Math.abs(pattern.differenceKcal), 0)} kcal a day higher than your weekends.`}
              </p>
            </>
          }
        >
          <Hero
            size="sm"
            value={fmt(Math.abs(pattern.differenceKcal), 0)}
            unit="kcal"
            label={
              pattern.pattern === "even"
                ? "a day between weekdays and weekends"
                : pattern.pattern === "bigger-weekends"
                  ? "a day more at weekends"
                  : "a day more on weekdays"
            }
            tone={pattern.pattern === "even" ? "good" : "cool"}
          />
        </CompactCard>
      ) : null}

      <VictoriesCard victories={victories} today={today} />
    </InsightGrid>
  );
}
