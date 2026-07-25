"use client";

// Trend: what the scale is doing, how fast, and where it lands.
//
// The four cards here are deliberately ordered from fact to forecast — the line
// the user can see, the rate it implies, the date that implies, and how far
// through they are. Each one is less certain than the one above it, and each
// says so.

import { useMemo, useState } from "react";
import { CalendarClock, Flag, Scale, TrendingDown } from "lucide-react";
import { TrendDotsChart } from "@/components/Charts";
import type { GoalProgress, GoalProjection, LossRate, TrendPoint } from "@/lib/insights";
import { Hero, InsightCard, NeedsMoreData, Section, StatRow, fmt, signed } from "./ui";

type Range = "week" | "month" | "all";
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
  { key: "all", label: "All", days: 100_000 },
];

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const VERDICT: Record<LossRate["verdict"], { text: string; tone: "good" | "warn" }> = {
  "on-track": {
    text: "Right in the healthy band for you. Keep going.",
    tone: "good",
  },
  slow: {
    text: "Under your healthy band. Fine if it's deliberate — the Coach will nudge the target if it stays here.",
    tone: "warn",
  },
  fast: {
    text: "Faster than your healthy band. Losing this quickly costs muscle, not just fat.",
    tone: "warn",
  },
  gaining: {
    text: "The trend is going up over the last week.",
    tone: "warn",
  },
};

const CONFIDENCE: Record<GoalProjection["confidence"], string> = {
  high: "The trend has been steady, so this window is a fair bet.",
  medium: "The trend wobbles a bit — treat this as a rough window.",
  low: "The trend is noisy, so this is a wide guess. It'll tighten as you log more.",
};

export default function TrendSection({
  trend,
  rate,
  projection,
  progress,
}: {
  trend: TrendPoint[];
  rate: LossRate | null;
  projection: GoalProjection | null;
  progress: GoalProgress | null;
}) {
  const [range, setRange] = useState<Range>("month");

  const shown = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    const cutoff = new Date(Date.now() - (days - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    // The trend itself is always computed over the FULL history; the range only
    // decides how much of it is on screen. Recomputing it per range would give
    // the "week" view a line that starts from scratch every Monday.
    return trend.filter((p) => p.date >= cutoff);
  }, [trend, range]);

  return (
    <Section title="Trend">
      <InsightCard
        icon={<Scale size={16} />}
        title="Weight"
        aside={
          <div className="flex gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className="sc-chip px-3 py-1.5 text-sm"
                data-active={range === r.key}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      >
        {trend.length === 0 ? (
          <NeedsMoreData what="weigh in on four separate days and the trend line appears." />
        ) : (
          <TrendDotsChart data={shown} />
        )}
      </InsightCard>

      <InsightCard icon={<TrendingDown size={16} />} title="Rate of loss">
        {rate == null ? (
          <NeedsMoreData what="a week of weigh-ins is needed to measure a rate." />
        ) : (
          <>
            <Hero
              value={fmt(rate.kgPerWeek, 2)}
              unit="kg / week"
              label={`${fmt(rate.pctPerWeek, 2)}% of your bodyweight`}
              tone={VERDICT[rate.verdict].tone === "good" ? "good" : "warn"}
            />
            <p className="text-sm text-[var(--muted)]">{VERDICT[rate.verdict].text}</p>
            <StatRow
              stats={[
                {
                  label: "Healthy for you",
                  value: `${fmt(rate.bandMinKg, 2)}–${fmt(rate.bandMaxKg, 2)} kg`,
                },
                {
                  label: "As a %",
                  value: `${fmt(rate.bandMinPct, 2)}–${fmt(rate.bandMaxPct, 2)}%`,
                },
              ]}
            />
          </>
        )}
      </InsightCard>

      <InsightCard icon={<CalendarClock size={16} />} title="Goal date">
        {projection == null ? (
          <NeedsMoreData what="three weeks of weigh-ins on a falling trend, plus a goal weight on your profile." />
        ) : (
          <>
            <Hero
              value={
                projection.latest
                  ? `${longDate(projection.earliest)} – ${longDate(projection.latest)}`
                  : `${longDate(projection.earliest)} or later`
              }
              label={`around ${projection.weeksMid} weeks at this rate`}
            />
            <p className="text-sm text-[var(--muted)]">
              {CONFIDENCE[projection.confidence]}
            </p>
            <StatRow
              stats={[
                { label: "Middle estimate", value: longDate(projection.midpoint) },
                { label: "Left to lose", value: `${fmt(projection.remainingKg)} kg` },
                { label: "Confidence", value: projection.confidence },
              ]}
            />
          </>
        )}
      </InsightCard>

      <InsightCard icon={<Flag size={16} />} title="The journey">
        {progress == null ? (
          <NeedsMoreData what="set a goal weight on your profile to track the journey." />
        ) : (
          <>
            <Hero
              value={`${progress.pctComplete}`}
              unit="%"
              label={
                progress.reached
                  ? "of the way there — goal reached"
                  : "of the way to your goal"
              }
              tone={progress.reached ? "good" : "cool"}
            />
            <div
              className="h-3 overflow-hidden rounded-full bg-[var(--fill)]"
              role="progressbar"
              aria-valuenow={progress.pctComplete}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, progress.pctComplete)}%`,
                  background: "var(--grad-primary)",
                }}
              />
            </div>
            <StatRow
              stats={[
                { label: "Started", value: `${fmt(progress.startKg)} kg` },
                {
                  label: "Lost",
                  value: `${signed(-progress.lostKg)} kg`,
                  tone: progress.lostKg > 0 ? "good" : undefined,
                },
                { label: "To go", value: `${fmt(progress.remainingKg)} kg` },
                { label: "Goal", value: `${fmt(progress.goalKg)} kg` },
              ]}
            />
          </>
        )}
      </InsightCard>
    </Section>
  );
}
