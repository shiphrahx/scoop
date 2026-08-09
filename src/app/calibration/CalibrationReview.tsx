"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { CalibrationWrap, ProjectionPoint } from "@/lib/calibrationwrap";
import { startDeficit } from "./actions";

// The end of calibration, shown as what it is: the first thing the user
// achieved. A fortnight of logging bought a maintenance figure measured from
// their own body, and every target from here is built on it — so the numbers get
// a screen each rather than a line on Home.
//
// One finding per card, tapped through in order, ending on the new target and
// the button that starts it. Every card is built from a real measurement: any
// finding whose data is missing is dropped rather than filled with a guess.

const kcal = (n: number) => Math.round(n).toLocaleString("en-GB");
const kg = (n: number) => `${n >= 0 ? "" : "−"}${Math.abs(n).toFixed(1)} kg`;

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface Card {
  key: string;
  kicker: string;
  value: string;
  unit?: string;
  body: string;
  // The gradient this card wears. Cycled so consecutive cards never repeat.
  grad: string;
  chart?: ProjectionPoint[];
  target?: CalibrationWrap["newTarget"];
}

const GRADS = ["var(--grad-cool)", "var(--grad-primary)", "var(--grad-indigo)", "var(--grad-warm)"];

// How the review is being watched: live, at the moment the hold ends and the
// deficit is waiting to start — or replayed later from the history, when the
// deficit has long since begun and there is nothing left to press.
export interface ReviewOptions {
  replay?: boolean;
  // When the review was filed, for the replay's opening line.
  endedAt?: string | null;
}

// The findings, in the order they're told: what you did, what we measured, what
// it means, what happens now.
export function buildCards(
  w: CalibrationWrap,
  name: string | null,
  opts: ReviewOptions = {},
): Card[] {
  const cards: Omit<Card, "grad">[] = [];
  const { replay = false, endedAt = null } = opts;

  cards.push({
    key: "held",
    kicker: replay
      ? endedAt
        ? `Calibration review · ${longDate(endedAt.slice(0, 10))}`
        : "Calibration review"
      : name
        ? `${name}, calibration is complete`
        : "Calibration is complete",
    value: String(w.days),
    unit: w.days === 1 ? "day" : "days",
    body:
      `You ate at maintenance for ${w.days} day${w.days === 1 ? "" : "s"} while the app watched what happened. ` +
      `Food was logged on ${w.loggedDays} of them and you weighed in ${w.weighInDays} time${
        w.weighInDays === 1 ? "" : "s"
      }. That is the data everything below is built on.`,
  });

  if (w.measuredMaintenanceKcal != null) {
    const delta = w.maintenanceDeltaKcal;
    const versus =
      delta == null || w.predictedMaintenanceKcal == null
        ? ""
        : Math.abs(delta) < 50
          ? ` The standard formula predicted ${kcal(w.predictedMaintenanceKcal)}, so your body runs close to average for your size.`
          : delta > 0
            ? ` The standard formula predicted ${kcal(w.predictedMaintenanceKcal)} — you burn about ${kcal(delta)} kcal a day more than an estimate would have given you.`
            : ` The standard formula predicted ${kcal(w.predictedMaintenanceKcal)} — you burn about ${kcal(-delta)} kcal a day less than an estimate would have given you.`;
    cards.push({
      key: "burn",
      kicker: "What your body actually burns",
      value: kcal(w.measuredMaintenanceKcal),
      unit: "kcal a day",
      body:
        `Measured from what you ate against what the scale did, not from a formula.${versus}` +
        ` This is the number your targets are built from now.`,
    });
  }

  if (w.activeShare != null) {
    const restingPct = Math.round((1 - w.activeShare) * 100);
    const steps =
      w.meanStepsPerDay != null
        ? ` You averaged ${kcal(w.meanStepsPerDay)} steps a day.`
        : "";
    const sleep =
      w.meanSleepHours != null
        ? ` Sleep averaged ${w.meanSleepHours.toFixed(1)} hours a night.`
        : "";
    cards.push({
      key: "split",
      kicker: "Where that energy goes",
      value: `${Math.round(w.activeShare * 100)}%`,
      unit: "of it is movement",
      body:
        `About ${restingPct}% of your burn happens lying still — heart, brain, organs. ` +
        `The rest is you moving.${steps}${sleep}`,
    });
  }

  if (w.weightChangeKg != null && w.meanIntakeKcal != null) {
    const steady = Math.abs(w.weightChangeKg) < 0.5;
    cards.push({
      key: "response",
      kicker: "How your weight responded",
      value: steady ? "Steady" : kg(w.weightChangeKg),
      unit: steady ? "at maintenance" : w.weightChangeKg > 0 ? "lost" : "gained",
      body: steady
        ? `You averaged ${kcal(w.meanIntakeKcal)} kcal a day and your trend weight barely moved. ` +
          `That is exactly what maintenance looks like, and it is why the measurement above can be trusted.`
        : w.weightChangeKg > 0
          ? `You averaged ${kcal(w.meanIntakeKcal)} kcal a day and still lost weight, so your real burn sits above what you ate. ` +
            `That has been taken into account.`
          : `You averaged ${kcal(w.meanIntakeKcal)} kcal a day and the trend rose slightly. ` +
            `Some of that is water and food weight; the rest is accounted for in the figure above.`,
    });
  }

  const t = w.newTarget;
  cards.push({
    key: "target",
    kicker: replay ? "The target it set" : "Your target from today",
    value: kcal(t.kcal),
    unit: "kcal a day",
    target: t,
    body:
      `A ${kcal(w.deficitKcal)} kcal a day cut from your calibrated maintenance. ` +
      `Opening deficits are kept modest on purpose — the aim is a cut you can hold for months, not the fastest one arithmetic allows. ` +
      `Protein is set high to protect muscle while you lose.`,
  });

  if (w.expectedLossKgPerWeek != null) {
    const goal =
      w.projection?.goalDate != null && w.projection.goalWeeks != null
        ? ` At that rate you reach your goal weight around ${longDate(w.projection.goalDate)} — about ${w.projection.goalWeeks} weeks.`
        : "";
    const band =
      w.inHealthyBand === false
        ? " That is a deliberately cautious rate for your body."
        : "";
    cards.push({
      key: "expect",
      kicker: "What to expect",
      value: w.expectedLossKgPerWeek.toFixed(2),
      unit: "kg a week",
      chart: w.projection?.points,
      body:
        `Loss slows as you get lighter — a smaller body burns less, so the same target is a smaller deficit each month.${goal}${band}` +
        ` Weeks vary by a few hundred grams; the trend is what counts.`,
    });
  }

  // The closing card is the only one that differs between watching and
  // re-watching: live it is the button that starts the deficit, replayed it is
  // the way out. Everything above it is the record and reads the same for ever.
  cards.push(
    replay
      ? {
          key: "end",
          kicker: "That was your calibration",
          value: "Done",
          body:
            `These are the findings exactly as they were shown to you when this deficit started. ` +
            `They are kept as they were — your targets have moved on since, and are reviewed against your results every week.`,
        }
      : {
          key: "start",
          kicker: "Ready",
          value: "Start now",
          body:
            `Your new target applies from today. It is held for two weeks before any adjustment — that is how long the body takes to show a real response rather than a change in water weight. ` +
            `After that your results are reviewed every week, and nothing changes without you agreeing to it.`,
        },
  );

  return cards.map((c, i) => ({ ...c, grad: GRADS[i % GRADS.length] }));
}

export default function CalibrationReview({
  wrap,
  name,
  replay = false,
  endedAt = null,
}: {
  wrap: CalibrationWrap;
  name: string | null;
  // A review being re-watched from the history: same findings, but nothing to
  // start — that deficit began the day it was filed.
  replay?: boolean;
  endedAt?: string | null;
}) {
  const cards = useMemo(
    () => buildCards(wrap, name, { replay, endedAt }),
    [wrap, name, replay, endedAt],
  );
  const [i, setI] = useState(0);
  const [busy, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const card = cards[i];
  const last = i === cards.length - 1;

  function start() {
    setErr(null);
    startTransition(async () => {
      // Resolve the failure rather than throwing it: an error escaping an async
      // transition is an unhandled rejection React re-raises past this handler,
      // and the user would see nothing at all.
      const failure = await startDeficit().then(
        () => null,
        (e: unknown) => e,
      );
      if (failure) {
        setErr(
          failure instanceof Error
            ? failure.message
            : "Could not start your new target.",
        );
      }
    });
  }

  return (
    <main
      className="flex min-h-dvh flex-col gap-6 p-6 text-white"
      style={{ background: card.grad }}
    >
      {/* Where you are in the review. */}
      <div className="flex items-center gap-1.5 pt-2" aria-hidden>
        {cards.map((c, n) => (
          <span
            key={c.key}
            className="h-1 flex-1 rounded-full transition"
            style={{ background: n <= i ? "white" : "rgba(255,255,255,0.3)" }}
          />
        ))}
      </div>

      <section className="flex flex-1 flex-col justify-center gap-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
          {card.kicker}
        </p>
        <h1 className="text-6xl font-bold leading-none tracking-tight">{card.value}</h1>
        {card.unit && <p className="-mt-2 text-xl font-semibold text-white/90">{card.unit}</p>}

        {card.target && (
          <ul className="flex flex-wrap gap-2 pt-1">
            {[
              ["Protein", card.target.protein_g],
              ["Carbs", card.target.carbs_g],
              ["Fat", card.target.fat_g],
            ].map(([label, grams]) => (
              <li
                key={label as string}
                className="rounded-2xl bg-white/20 px-3 py-2 text-sm font-semibold"
              >
                {label} {Math.round(grams as number)} g
              </li>
            ))}
          </ul>
        )}

        {card.chart && card.chart.length > 1 && <ProjectionCurve points={card.chart} />}

        <p className="max-w-prose text-white/90">{card.body}</p>
      </section>

      {err && (
        <p className="rounded-2xl bg-white/20 p-3 text-sm font-medium" role="alert">
          {err}
        </p>
      )}

      <div className="flex items-center gap-3 pb-2">
        {i > 0 && (
          <button
            onClick={() => setI((n) => n - 1)}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/20 transition active:scale-90"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        {last && replay ? (
          <Link
            href="/me"
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-white text-lg font-bold text-[var(--ink-teal)] transition active:scale-95"
          >
            <Check size={20} /> Done
          </Link>
        ) : last ? (
          <button
            onClick={start}
            disabled={busy}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-white text-lg font-bold text-[var(--ink-teal)] transition active:scale-95 disabled:opacity-60"
          >
            <Check size={20} /> {busy ? "Starting…" : "Start now"}
          </button>
        ) : (
          <button
            onClick={() => setI((n) => Math.min(n + 1, cards.length - 1))}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-white/20 text-lg font-semibold transition active:scale-95"
          >
            Next <ArrowRight size={20} />
          </button>
        )}
      </div>
    </main>
  );
}

// The projected weight curve, drawn as plain SVG.
//
// Deliberately not Recharts: this is one static line on a screen a user sees
// once, and pulling a charting library into it would cost more to load than the
// whole review. Also draws the truth of the shape — the curve flattens, because
// a lighter body burns less at the same target.
export function ProjectionCurve({ points }: { points: ProjectionPoint[] }) {
  const W = 320;
  const H = 90;
  const kgs = points.map((p) => p.kg);
  const max = Math.max(...kgs);
  const min = Math.min(...kgs);
  const span = max - min || 1;
  const lastWeek = points[points.length - 1].week || 1;

  const xy = (p: ProjectionPoint) => [
    (p.week / lastWeek) * W,
    ((max - p.kg) / span) * (H - 10) + 5,
  ];
  const line = points.map((p) => xy(p).join(",")).join(" ");
  const area = `${line} ${W},${H} 0,${H}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Projected weight from ${kgs[0].toFixed(1)} to ${kgs[kgs.length - 1].toFixed(1)} kilograms over ${lastWeek} weeks`}
    >
      <polygon points={area} fill="rgba(255,255,255,0.18)" />
      <polyline
        points={line}
        fill="none"
        stroke="white"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={0} cy={xy(points[0])[1]} r={4} fill="white" />
      <circle
        cx={W}
        cy={xy(points[points.length - 1])[1]}
        r={4}
        fill="white"
      />
    </svg>
  );
}
