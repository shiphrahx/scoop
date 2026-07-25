"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity as ActivityIcon, Moon, Ruler, Watch } from "lucide-react";
import {
  MeasurementsChart,
  SleepChart,
  WeightTrendChart,
  WeightVsExercise,
} from "@/components/Charts";
import type { Activity } from "@/lib/types";

type Range = "week" | "month" | "all";
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
  { key: "all", label: "All", days: 100000 },
];

const MEASURES = [
  { key: "waist_cm", label: "Waist" },
  { key: "chest_cm", label: "Chest" },
  { key: "arms_cm", label: "Arms" },
  { key: "thighs_cm", label: "Thighs" },
  { key: "hips_cm", label: "Hips" },
] as const;
type MeasureKey = (typeof MEASURES)[number]["key"];

interface MeasurementRow {
  date: string;
  chest_cm: number | null;
  waist_cm: number | null;
  arms_cm: number | null;
  thighs_cm: number | null;
  hips_cm: number | null;
}

// The view-only, interactive trends. One range toggle drives every chart; the
// measurement chart also lets you switch which tape reading it shows. Sleep and
// exercise fall back to a "connect a device" placeholder when nothing feeds them.
export default function Dashboard({
  weights,
  measurements,
  activity,
  deviceConnected,
}: {
  weights: { date: string; weight_kg: number }[];
  measurements: MeasurementRow[];
  activity: Activity[];
  deviceConnected: boolean;
}) {
  const [range, setRange] = useState<Range>("month");
  const [measure, setMeasure] = useState<MeasureKey>("waist_cm");

  const cutoff = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    const d = new Date();
    d.setDate(d.getDate() - (days - 1));
    return d.toISOString().slice(0, 10);
  }, [range]);

  const weightData = useMemo(
    () =>
      weights
        .filter((w) => w.date >= cutoff)
        .map((w) => ({ date: w.date, weight: w.weight_kg })),
    [weights, cutoff],
  );

  const measureData = useMemo(
    () =>
      measurements
        .filter((m) => m.date >= cutoff && m[measure] != null)
        .map((m) => ({ date: m.date, value: m[measure] as number })),
    [measurements, cutoff, measure],
  );

  const inRange = useMemo(
    () => activity.filter((a) => a.date >= cutoff),
    [activity, cutoff],
  );
  const burn = useMemo(
    () =>
      inRange
        .filter((a) => a.workout_kcal != null)
        .map((a) => ({ date: a.date, kcal: a.workout_kcal as number })),
    [inRange],
  );
  const sleep = useMemo(
    () =>
      inRange
        .filter((a) => a.sleep_hours != null)
        .map((a) => ({ date: a.date, hours: a.sleep_hours as number })),
    [inRange],
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Trends
        </h2>
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
      </div>

      <ChartCard icon={<ActivityIcon size={16} />} title="Weight">
        <WeightTrendChart data={weightData} />
      </ChartCard>

      <ChartCard icon={<Ruler size={16} />} title="Measurements">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {MEASURES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMeasure(m.key)}
              className="sc-chip px-3 py-1.5 text-sm"
              data-active={measure === m.key}
            >
              {m.label}
            </button>
          ))}
        </div>
        <MeasurementsChart
          data={measureData}
          label={MEASURES.find((m) => m.key === measure)!.label}
        />
      </ChartCard>

      <ChartCard icon={<Watch size={16} />} title="Exercise">
        {deviceConnected ? (
          <WeightVsExercise weights={weightData} burn={burn} />
        ) : (
          <ConnectPlaceholder what="exercise" />
        )}
      </ChartCard>

      <ChartCard icon={<Moon size={16} />} title="Sleep">
        {deviceConnected ? (
          <SleepChart data={sleep} />
        ) : (
          <ConnectPlaceholder what="sleep" />
        )}
      </ChartCard>
    </section>
  );
}

function ChartCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sc-card flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2 text-[var(--muted)]">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--fill)]">
          {icon}
        </span>
        <span className="text-sm font-semibold text-[var(--foreground)]">{title}</span>
      </div>
      {children}
    </div>
  );
}

function ConnectPlaceholder({ what }: { what: string }) {
  return (
    <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
      <Watch size={22} className="text-[var(--muted)]" />
      <p className="text-sm text-[var(--muted)]">
        Connect a device to see {what} trends.
      </p>
      <Link href="/me" className="sc-btn sc-btn-soft mt-1">
        Connect a device
      </Link>
    </div>
  );
}
