"use client";

// Drivers: which habits actually move this person's scale.
//
// Every card here is a weekly paired comparison and nothing cleverer, so every
// card carries the same warning. The value isn't the correlation coefficient —
// it's the contrast line underneath it ("your best weeks slept 7.8 h, your worst
// 6.4 h"), which is a thing a person can go and do something about.

import { Flame, Footprints, Moon, UtensilsCrossed, Zap } from "lucide-react";
import { CompareBars, DriverScatter, SleepChart, WeightVsExercise } from "@/components/Charts";
import type { Correlation, HighDayImpact, MovementCorrelation } from "@/lib/insights";
import {
  ConnectPrompt,
  Expandable,
  InsightCard,
  NeedsMoreData,
  PatternNote,
  Section,
  StatRow,
  fmt,
} from "./ui";

const NEED_WEEKS = "four weeks of both weigh-ins and this habit are needed before a pattern means anything.";

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

export default function DriversSection({
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
  return (
    <Section title="Drivers">
      <InsightCard icon={<Moon size={16} />} title="Sleep and weight loss">
        {!deviceConnected ? (
          <ConnectPrompt what="how your sleep tracks against your losses" />
        ) : sleep == null ? (
          <NeedsMoreData what={NEED_WEEKS} />
        ) : (
          <>
            <DriverScatter points={sleep.points} xLabel="Sleep" xUnit="h" />
            <Finding c={sleep} driver="sleep" unit="h" />
            <Expandable label="See the week-by-week hours">
              <SleepChart data={sleepSeries} />
            </Expandable>
          </>
        )}
      </InsightCard>

      <InsightCard icon={<Footprints size={16} />} title="Movement and weight loss">
        {!deviceConnected ? (
          <ConnectPrompt what="how your movement tracks against your losses" />
        ) : movement == null ? (
          <NeedsMoreData what={NEED_WEEKS} />
        ) : (
          <>
            <DriverScatter
              points={movement.points}
              xLabel={movement.metric === "steps" ? "Steps" : "Exercise burn"}
              xUnit={movement.metric === "steps" ? "/ day" : "kcal"}
            />
            <Finding
              c={movement}
              driver={movement.metric === "steps" ? "walking" : "exercise"}
              unit={movement.metric === "steps" ? "steps/day" : "kcal/day"}
              decimals={0}
            />
            <Expandable label="See weight against exercise burn">
              <WeightVsExercise weights={weightSeries} burn={burnSeries} />
            </Expandable>
          </>
        )}
      </InsightCard>

      <InsightCard icon={<UtensilsCrossed size={16} />} title="Sticking to the plan">
        {adherence == null ? (
          <NeedsMoreData what="four weeks of food logging against a weekly target are needed here." />
        ) : (
          <>
            <DriverScatter points={adherence.points} xLabel="Stuck to target" xUnit="%" />
            <Finding c={adherence} driver="sticking to the target" unit="%" decimals={0} />
            {adherence.direction === "helps" ? (
              <p className="text-sm text-[var(--muted)]">
                Your plan works when you follow it — so a stall is a cue to eat the plan,
                not to cut it further.
              </p>
            ) : null}
          </>
        )}
      </InsightCard>

      {cyclingEnabled ? (
        <InsightCard icon={<Flame size={16} />} title="High days">
          {highDay == null ? (
            <NeedsMoreData what="two weeks with high days and two without are needed to compare them." />
          ) : (
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
          )}
        </InsightCard>
      ) : (
        <InsightCard icon={<Zap size={16} />} title="High days">
          <p className="text-sm text-[var(--muted)]">
            Calorie cycling is off, so there&apos;s nothing to compare. Turn it on in your
            profile if you want a couple of higher-carb days a week.
          </p>
        </InsightCard>
      )}
    </Section>
  );
}
