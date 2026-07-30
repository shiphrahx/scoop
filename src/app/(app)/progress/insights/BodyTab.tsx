"use client";

// Body: the things the scale doesn't know.
//
// Weight is one number about a body and a bad one on its own — it can't tell
// water from fat, and it can't tell where the fat is. The tape can do both, so
// this tab is where a stalled week stops looking like failure.

import { useMemo, useState } from "react";
import { Camera, ClipboardList, Ruler, Target } from "lucide-react";
import { MeasurementsChart } from "@/components/ChartsLazy";
import type { PhotoPair, WaistToHeight } from "@/lib/insights";
import type { CheckIn, CheckInPhoto } from "@/lib/types";
import CheckInHistory from "../CheckInHistory";
import PhotoCompare from "./PhotoCompare";
import {
  CompactCard,
  Hero,
  InsightGrid,
  NeedsMoreData,
  StatRow,
  fmt,
  signed,
  type LockedInsight,
} from "./ui";

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

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

const BAND: Record<WaistToHeight["band"], { label: string; note: string; tone: "good" | "warn" }> = {
  low: {
    label: "Below the usual range",
    note: "Your waist is under 40% of your height. Consider speaking to a doctor if you are still in a deficit.",
    tone: "warn",
  },
  healthy: {
    label: "Healthy range",
    note: "Your waist is under half your height, which is the recommended range.",
    tone: "good",
  },
  increased: {
    label: "Increased risk",
    note: "Your waist is over half your height. Bringing it below that ratio is the main target.",
    tone: "warn",
  },
  high: {
    label: "High risk",
    note: "Your waist is 60% or more of your height. This ratio matters more than the number on the scale.",
    tone: "warn",
  },
};

export default function BodyTab({
  whtr,
  measurements,
  pairs,
  checkIns,
}: {
  whtr: WaistToHeight | null;
  measurements: MeasurementRow[];
  pairs: PhotoPair[];
  checkIns: (CheckIn & { photos: CheckInPhoto[] })[];
}) {
  const locked: LockedInsight[] = [];
  const anyMeasurement = measurements.some((m) =>
    MEASURES.some((k) => m[k.key] != null),
  );
  const pair = pairs[0] ?? null;

  if (whtr == null) {
    locked.push({
      title: "Waist to height",
      why: "A stronger health indicator than weight alone. Add a waist at a check-in and a height on your profile.",
    });
  }
  if (!anyMeasurement) {
    locked.push({
      title: "Measurements",
      why: "Track waist, chest, arms, thighs and hips, which can change on weeks the scale doesn't. Take them at a check-in.",
    });
  }
  if (pair == null) {
    locked.push({
      title: "Then and now",
      why: "Slide your first photo over your latest. Add one at two check-ins a week or more apart.",
    });
  }
  if (checkIns.length === 0) {
    locked.push({
      title: "Past check-ins",
      why: "Every check-in with its measurements, notes and photos. Add your first to start the record.",
    });
  }

  return (
    <InsightGrid locked={locked}>
      {whtr != null ? (
        <CompactCard
          icon={<Target size={16} />}
          title="Waist to height"
          detail={<WaistDetail whtr={whtr} />}
        >
          <Hero
            size="sm"
            value={fmt(whtr.ratio, 2)}
            label={BAND[whtr.band].label}
            tone={BAND[whtr.band].tone}
          />
        </CompactCard>
      ) : null}

      {anyMeasurement ? <MeasurementsCard measurements={measurements} /> : null}

      {pair != null ? (
        <CompactCard
          icon={<Camera size={16} />}
          title="Then and now"
          detail={<PhotoCompare pairs={pairs} />}
        >
          <span className="block overflow-hidden rounded-xl bg-[var(--fill)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed,
                short-lived Supabase storage URLs; not optimisable by next/image */}
            <img src={pair.latest.url} alt="" className="h-24 w-full object-cover" />
          </span>
          <span className="text-xs text-[var(--muted)]">
            {pair.weeksApart} weeks apart
          </span>
        </CompactCard>
      ) : null}

      {checkIns.length > 0 ? (
        <CompactCard
          icon={<ClipboardList size={16} />}
          title="Past check-ins"
          detail={<CheckInHistory initial={checkIns} />}
        >
          <Hero
            size="sm"
            value={`${checkIns.length}`}
            label={`latest ${shortDate(checkIns[0].date)}`}
          />
        </CompactCard>
      ) : null}
    </InsightGrid>
  );
}

function WaistDetail({ whtr }: { whtr: WaistToHeight }) {
  return (
    <>
      <Hero
        value={fmt(whtr.ratio, 2)}
        label={BAND[whtr.band].label}
        tone={BAND[whtr.band].tone}
      />
      {/* A track with the healthy band marked, so the ratio has somewhere to sit
          rather than being a bare decimal. */}
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
  );
}

// The tape, one measure at a time. The compact face shows whichever measure is
// selected; the chips and the chart live in the detail.
function MeasurementsCard({ measurements }: { measurements: MeasurementRow[] }) {
  // Open on a measure that has actually been taken, so the card doesn't lead
  // with an empty waist when the only readings are arms.
  const first =
    MEASURES.find((m) => measurements.some((row) => row[m.key] != null))?.key ??
    "waist_cm";
  const [measure, setMeasure] = useState<MeasureKey>(first);

  const measureData = useMemo(
    () =>
      measurements
        .filter((m) => m[measure] != null)
        .map((m) => ({ date: m.date, value: m[measure] as number })),
    [measurements, measure],
  );

  const label = MEASURES.find((m) => m.key === measure)!.label;
  const latest = measureData.length > 0 ? measureData[measureData.length - 1] : null;
  const change = measureData.length > 1 ? latest!.value - measureData[0].value : null;

  return (
    <CompactCard
      icon={<Ruler size={16} />}
      title="Measurements"
      detail={
        <>
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
            <MeasurementsChart data={measureData} label={label} />
          )}
        </>
      }
    >
      <Hero
        size="sm"
        value={latest ? fmt(latest.value) : "—"}
        unit={latest ? "cm" : undefined}
        label={change != null ? `${label} — ${signed(change)} cm since the first` : label}
        tone={change != null && change < 0 ? "good" : "cool"}
      />
    </CompactCard>
  );
}
