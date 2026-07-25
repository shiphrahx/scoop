"use client";

// Drivers: which habits actually move this person's scale.
//
// Every card here is a weekly paired comparison and nothing cleverer, so every
// card carries the same warning. The value isn't the correlation coefficient —
// it's the contrast line underneath it ("your best weeks slept 7.8 h, your worst
// 6.4 h"), which is a thing a person can go and do something about.

import { Flame, Footprints, Moon, UtensilsCrossed } from "lucide-react";
import { CompareBars, DriverScatter, SleepChart, WeightVsExercise } from "@/components/Charts";
import type { Correlation, HighDayImpact, MovementCorrelation } from "@/lib/insights";
import {
  CompactCard,
  Expandable,
  Hero,
  InsightGrid,
  PatternNote,
  StatRow,
  fmt,
  type LockedInsight,
} from "./ui";

const NEED_WEEKS = "Four weeks of weigh-ins and this habit unlocks it.";

function Finding({
  c,
  driver,
  unit,
  decimals = 1,
}: {
  c: Correlation;
  driver: string;
  unit: string;
  decimals?: number;
}) {
  const verdict =
    c.strength === "none"
      ? `No clear link between ${driver} and how much you lose.`
      : c.direction === "helps"
        ? `More ${driver} lines up with losing more — a ${c.strength} pattern.`
        : `More ${driver} lines up with losing less — a ${c.strength} pattern.`;

  return (
    <>
      <p className="text-sm text-[var(--foreground)]">{verdict}</p>
      <p className="text-sm text-[var(--muted)]">
        Your best weeks averaged {fmt(c.bestWeeksMean, decimals)} {unit}; your worst
        averaged {fmt(c.worstWeeksMean, decimals)} {unit}.
      </p>
      <PatternNote weeks={c.n} />
    </>
  );
}

// The compact face of a correlation card: the contrast, not the coefficient.
function DriverFace({
  c,
  unit,
  decimals = 1,
}: {
  c: Correlation;
  unit: string;
  decimals?: number;
}) {
  return (
    <Hero
      size="sm"
      value={fmt(c.bestWeeksMean, decimals)}
      unit={unit}
      label={`on your best weeks · ${fmt(c.worstWeeksMean, decimals)} ${unit} on your worst`}
      tone={c.strength !== "none" && c.direction === "helps" ? "good" : "cool"}
    />
  );
}

export default function DriversTab({
  sleep,
  movement,
  adherence,
  highDay,
  cyclingEnabled,
  deviceConnected,
  weightSeries,
  burnSeries,
  sleepSeries,
}: {
  sleep: Correlation | null;
  movement: MovementCorrelation | null;
  adherence: Correlation | null;
  highDay: HighDayImpact | null;
  cyclingEnabled: boolean;
  deviceConnected: boolean;
  weightSeries: { date: string; weight: number }[];
  burnSeries: { date: string; kcal: number }[];
  sleepSeries: { date: string; hours: number }[];
}) {
  const locked: LockedInsight[] = [];

  // No wearable means these two never fill in by waiting, so they say so and
  // offer the link rather than counting weeks.
  if (!deviceConnected) {
    locked.push({
      title: "Sleep and weight loss",
      why: "See whether the weeks you sleep more are the weeks you lose more. Needs a wearable.",
      connect: true,
    });
    locked.push({
      title: "Movement and weight loss",
      why: "See whether your busiest weeks are your best ones. Needs a wearable.",
      connect: true,
    });
  } else {
    if (sleep == null) {
      locked.push({
        title: "Sleep and weight loss",
        why: `Sleep is the driver people never suspect. ${NEED_WEEKS}`,
      });
    }
    if (movement == null) {
      locked.push({
        title: "Movement and weight loss",
        why: `Find out if moving more really moves your scale. ${NEED_WEEKS}`,
      });
    }
  }
  if (adherence == null) {
    locked.push({
      title: "Sticking to the plan",
      why: "See how much your losses depend on hitting the target. Four weeks of logging against a target unlocks it.",
    });
  }
  if (!cyclingEnabled) {
    locked.push({
      title: "High days",
      why: "Compare weeks with high days against weeks without. Turn calorie cycling on in your profile.",
    });
  } else if (highDay == null) {
    locked.push({
      title: "High days",
      why: "Compare weeks with high days against weeks without. Needs two weeks of each.",
    });
  }

  const movementUnit = movement?.metric === "steps" ? "steps/day" : "kcal/day";

  return (
    <InsightGrid locked={locked}>
      {deviceConnected && sleep != null ? (
        <CompactCard
          icon={<Moon size={16} />}
          title="Sleep and weight loss"
          detail={
            <>
              <DriverScatter points={sleep.points} xLabel="Sleep" xUnit="h" />
              <Finding c={sleep} driver="sleep" unit="h" />
              <Expandable label="See the week-by-week hours">
                <SleepChart data={sleepSeries} />
              </Expandable>
            </>
          }
        >
          <DriverFace c={sleep} unit="h" />
        </CompactCard>
      ) : null}

      {deviceConnected && movement != null ? (
        <CompactCard
          icon={<Footprints size={16} />}
          title="Movement and weight loss"
          detail={
            <>
              <DriverScatter
                points={movement.points}
                xLabel={movement.metric === "steps" ? "Steps" : "Exercise burn"}
                xUnit={movement.metric === "steps" ? "/ day" : "kcal"}
              />
              <Finding
                c={movement}
                driver={movement.metric === "steps" ? "walking" : "exercise"}
                unit={movementUnit}
                decimals={0}
              />
              <Expandable label="See weight against exercise burn">
                <WeightVsExercise weights={weightSeries} burn={burnSeries} />
              </Expandable>
            </>
          }
        >
          <DriverFace c={movement} unit={movementUnit} decimals={0} />
        </CompactCard>
      ) : null}

      {adherence != null ? (
        <CompactCard
          icon={<UtensilsCrossed size={16} />}
          title="Sticking to the plan"
          detail={
            <>
              <DriverScatter points={adherence.points} xLabel="Stuck to target" xUnit="%" />
              <Finding c={adherence} driver="sticking to the target" unit="%" decimals={0} />
              {adherence.direction === "helps" ? (
                <p className="text-sm text-[var(--muted)]">
                  Your plan works when you follow it — so a stall is a cue to eat the
                  plan, not to cut it further.
                </p>
              ) : null}
            </>
          }
        >
          <DriverFace c={adherence} unit="%" decimals={0} />
        </CompactCard>
      ) : null}

      {cyclingEnabled && highDay != null ? (
        <CompactCard
          icon={<Flame size={16} />}
          title="High days"
          detail={
            <>
              <CompareBars
                unit="kg / week"
                decimals={2}
                rows={[
                  {
                    label: `Weeks with high days (${highDay.withWeeks})`,
                    value: highDay.meanLossWithKg,
                    tint: "teal",
                  },
                  {
                    label: `Weeks without (${highDay.withoutWeeks})`,
                    value: highDay.meanLossWithoutKg,
                    tint: "violet",
                  },
                ]}
              />
              <p className="text-sm text-[var(--muted)]">
                {highDay.verdict === "no-difference"
                  ? "Much the same either way — which is what should happen, since high days don't change your weekly calorie total. Keep them if they make the week easier."
                  : highDay.verdict === "better"
                    ? `You lost ${fmt(highDay.differenceKg, 2)} kg/week more in weeks with high days.`
                    : `You lost ${fmt(Math.abs(highDay.differenceKg), 2)} kg/week less in weeks with high days. Worth checking a high day hasn't quietly become an extra day.`}
              </p>
              <StatRow
                stats={[
                  { label: "With", value: `${fmt(highDay.meanLossWithKg, 2)} kg/wk` },
                  { label: "Without", value: `${fmt(highDay.meanLossWithoutKg, 2)} kg/wk` },
                ]}
              />
            </>
          }
        >
          <Hero
            size="sm"
            value={fmt(highDay.meanLossWithKg, 2)}
            unit="kg/wk"
            label={`on high-day weeks · ${fmt(highDay.meanLossWithoutKg, 2)} without`}
            tone={highDay.verdict === "better" ? "good" : "cool"}
          />
        </CompactCard>
      ) : null}
    </InsightGrid>
  );
}
