"use client";

// Body: the things the scale doesn't know.
//
// Weight is one number about a body and a bad one on its own — it can't tell
// water from fat, and it can't tell where the fat is. The tape can do both, so
// this section is where a stalled week stops looking like failure.

import { useMemo, useState } from "react";
import { Ruler, Sparkles, Target } from "lucide-react";
import { MeasurementsChart } from "@/components/Charts";
import type { FatLossSignal, WaistToHeight } from "@/lib/insights";
import { Hero, InsightCard, NeedsMoreData, Section, StatRow, fmt, signed } from "./ui";

const MEASURES = [
  { key: "waist_cm", label: "Waist" },
  { key: "chest_cm", label: "Chest" },
  { key: "arms_cm", label: "Arms" },
  { key: "thighs_cm", label: "Thighs" },
  { key: "hips_cm", label: "Hips" },
] as const;
type MeasureKey = (typeof MEASURES)[number]["key"];

export interface MeasurementRow {
  date: string;
  chest_cm: number | null;
  waist_cm: number | null;
  arms_cm: number | null;
  thighs_cm: number | null;
  hips_cm: number | null;
}

const BAND: Record<WaistToHeight["band"], { label: string; note: string; tone: "good" | "warn" }> = {
  low: {
    label: "Below the usual range",
    note: "Your waist is under 40% of your height. Worth a word with a doctor if you're still cutting.",
    tone: "warn",
  },
  healthy: {
    label: "Healthy range",
    note: "Keeping your waist under half your height is the target — you're there.",
    tone: "good",
  },
  increased: {
    label: "Increased risk",
    note: "Your waist is over half your height. Bringing it under that line is the single best thing to aim at.",
    tone: "warn",
  },
  high: {
    label: "High risk",
    note: "Your waist is 60% or more of your height. This is the number worth chasing, ahead of the scale.",
    tone: "warn",
  },
};

export default function BodySection({
  fatLoss,
  whtr,
  measurements,
  children,
}: {
  fatLoss: FatLossSignal | null;
  whtr: WaistToHeight | null;
  measurements: MeasurementRow[];
  // The photo comparison, rendered by the parent so this stays a pure chart
  // component and the signed URLs don't have to travel through it.
  children?: React.ReactNode;
}) {
  const [measure, setMeasure] = useState<MeasureKey>("waist_cm");

  const measureData = useMemo(
    () =>
      measurements
        .filter((m) => m[measure] != null)
        .map((m) => ({ date: m.date, value: m[measure] as number })),
    [measurements, measure],
  );

  return (
    <Section title="Body">
      {/* The callout only appears when it's earned — a permanent "you might be
          losing fat!" panel would mean nothing the week it's actually true. */}
      {fatLoss?.detected ? (
        <div className="sc-grad-panel flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2">
            <Sparkles size={18} />
            <span className="font-semibold">You&apos;re losing fat</span>
          </div>
          <p className="text-sm">
            Over the last {fatLoss.windowDays} days the scale moved{" "}
            {signed(fatLoss.weightDeltaKg)} kg, but your waist is down{" "}
            {fmt(Math.abs(fatLoss.waistDeltaCm))} cm. That&apos;s fat leaving while water
            and muscle hold the number up. Keep going.
          </p>
        </div>
      ) : null}

      <InsightCard icon={<Target size={16} />} title="Waist to height">
        {whtr == null ? (
          <NeedsMoreData what="log a waist measurement at your next check-in (and a height on your profile)." />
        ) : (
          <>
            <Hero
              value={fmt(whtr.ratio, 2)}
              label={BAND[whtr.band].label}
              tone={BAND[whtr.band].tone}
            />
            {/* A track with the healthy band marked, so the ratio has somewhere
                to sit rather than being a bare decimal. */}
            <div className="relative h-3 overflow-hidden rounded-full bg-[var(--fill)]">
              <div
                className="absolute inset-y-0 rounded-full bg-[var(--tint-green)]"
                style={{ left: "25%", width: "25%" }}
              />
              <div
                className="absolute inset-y-0 w-1 rounded-full bg-[var(--foreground)]"
                style={{
                  left: `${Math.max(0, Math.min(98, ((whtr.ratio - 0.3) / 0.4) * 100))}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[var(--muted)]">
              <span>0.30</span>
              <span>healthy 0.40–0.50</span>
              <span>0.70</span>
            </div>
            <p className="text-sm text-[var(--muted)]">{BAND[whtr.band].note}</p>
            <StatRow
              stats={[
                { label: "Waist", value: `${fmt(whtr.waistCm)} cm` },
                { label: "Height", value: `${fmt(whtr.heightCm, 0)} cm` },
                { label: "Healthy up to", value: `${fmt(whtr.healthyMaxWaistCm, 0)} cm` },
              ]}
            />
          </>
        )}
      </InsightCard>

      <InsightCard
        icon={<Ruler size={16} />}
        title="Measurements"
        aside={null}
      >
        <div className="flex flex-wrap gap-1.5">
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
        {measureData.length === 0 ? (
          <NeedsMoreData what="this reading hasn't been taken at a check-in yet." />
        ) : (
          <MeasurementsChart
            data={measureData}
            label={MEASURES.find((m) => m.key === measure)!.label}
          />
        )}
      </InsightCard>

      {children}
    </Section>
  );
}
