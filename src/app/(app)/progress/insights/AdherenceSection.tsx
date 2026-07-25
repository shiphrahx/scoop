"use client";

// Adherence: did the plan get followed?
//
// This section exists so a stall can be diagnosed instead of guessed at. If the
// target was hit most days and the scale still didn't move, the target is wrong;
// if it wasn't, the target was never tested. Those need opposite fixes, and the
// scale alone can't tell them apart.

import { CalendarClock, CircleCheck, Flame } from "lucide-react";
import { CompareBars, WeeklyIntakeChart } from "@/components/Charts";
import type { WeekCompare, WeekScorecard, WeekdayWeekend } from "@/lib/insights";
import {
  Expandable,
  InsightCard,
  NeedsMoreData,
  Section,
  StatRow,
  fmt,
  signed,
} from "./ui";

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

export default function AdherenceSection({
  scorecard,
  weeks,
  pattern,
  hasTarget,
}: {
  scorecard: WeekScorecard;
  weeks: WeekCompare[];
  pattern: WeekdayWeekend | null;
  hasTarget: boolean;
}) {
  const latest = weeks.length > 0 ? weeks[weeks.length - 1] : null;

  return (
    <Section title="Adherence">
      <InsightCard icon={<CircleCheck size={16} />} title="This week">
        {!hasTarget ? (
          <NeedsMoreData what="finish onboarding so the Coach can set a weekly target to measure against." />
        ) : (
          <>
            <StatRow
              stats={[
                {
                  label: "Calories hit",
                  value: `${scorecard.kcalHitDays} / ${scorecard.daysSoFar}`,
                  tone: scorecard.kcalHitDays >= scorecard.daysSoFar - 1 ? "good" : undefined,
                },
                {
                  label: "Protein hit",
                  value: `${scorecard.proteinHitDays} / ${scorecard.daysSoFar}`,
                  tone:
                    scorecard.proteinHitDays >= scorecard.daysSoFar - 1 ? "good" : undefined,
                },
                {
                  label: "Days logged",
                  value: `${scorecard.loggedDays} / ${scorecard.daysSoFar}`,
                },
                {
                  label: "Streak",
                  value: `${scorecard.streakDays} day${scorecard.streakDays === 1 ? "" : "s"}`,
                  tone: scorecard.streakDays >= 7 ? "good" : undefined,
                },
              ]}
            />
            <p className="text-sm text-[var(--muted)]">
              Week of {shortDate(scorecard.weekStart)}. Calories count as hit within 15% of
              the target; protein counts once you reach 90% of it.
            </p>
          </>
        )}
      </InsightCard>

      <InsightCard icon={<Flame size={16} />} title="Eaten vs target">
        {weeks.length === 0 ? (
          <NeedsMoreData what="log food for a week that has a target on it." />
        ) : (
          <>
            <WeeklyIntakeChart
              data={weeks.map((w) => ({
                weekStart: w.weekStart,
                actual: w.actual.kcal,
                target: w.target.kcal,
              }))}
            />
            {latest ? (
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
            ) : null}
          </>
        )}
      </InsightCard>

      <InsightCard icon={<CalendarClock size={16} />} title="Weekdays vs weekends">
        {pattern == null ? (
          <NeedsMoreData what="six weekdays and three weekend days of food logging are needed to compare them." />
        ) : (
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
        )}
      </InsightCard>
    </Section>
  );
}
