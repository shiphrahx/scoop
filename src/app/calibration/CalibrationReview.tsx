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
  // Strictly about THIS user: their numbers, their fortnight, what happens to
  // them. Never a general statement about bodies or dieting.
  body: string;
  // The general point behind it — true of everyone, not measured from anything
  // this user did. Kept in its own slot because mixing the two into one
  // paragraph is what made the screen read as a leaflet: the reader could not
  // tell which sentences were about them. Rendered visibly apart, and labelled.
  note?: string;
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
    unit: w.days === 1 ? "day measured" : "days measured",
    body:
      `For ${w.days} day${w.days === 1 ? "" : "s"} you ate ${kcal(w.holdTargetKcal)} kcal a day, ` +
      `logged your food on ${w.loggedDays} of them and stepped on the scale ${w.weighInDays} time${
        w.weighInDays === 1 ? "" : "s"
      }. That is what made everything below possible — none of it is guesswork.`,
    note:
      `A fortnight is the shortest run that shows real change on the scale. Anything less and you are ` +
      `mostly watching water move in and out.`,
  });

  if (w.measuredMaintenanceKcal != null) {
    const delta = w.maintenanceDeltaKcal;
    const versus =
      delta == null || w.predictedMaintenanceKcal == null
        ? ""
        : Math.abs(delta) < 50
          ? ` A textbook formula would have guessed ${kcal(w.predictedMaintenanceKcal)} for someone your age, height and weight — close, as it turns out.`
            : delta > 0
            ? ` A textbook formula would have guessed ${kcal(w.predictedMaintenanceKcal)} for someone your age, height and weight. You run ${kcal(delta)} kcal a day warmer than that.`
            : ` A textbook formula would have guessed ${kcal(w.predictedMaintenanceKcal)} for someone your age, height and weight. You run ${kcal(-delta)} kcal a day cooler than that.`;
    cards.push({
      key: "burn",
      kicker: "What you burn",
      value: kcal(w.measuredMaintenanceKcal),
      unit: "kcal a day",
      body:
        `This is the amount that keeps you exactly where you are — no gain, no loss. ` +
        `It is your figure, not a guess: it came from the food you logged and what your weight did over ${w.days} days.${versus}`,
      note:
        `Formulas describe the average of thousands of people. Any one person can sit 300–400 kcal either side of ` +
        `that average, which is why it was worth spending a fortnight finding yours.`,
    });
  }

  if (w.activeShare != null) {
    const burn = w.measuredMaintenanceKcal ?? w.newTarget.kcal + w.deficitKcal;
    const restingKcal = Math.round(burn * (1 - w.activeShare));
    const movingKcal = Math.round(burn * w.activeShare);
    const steps =
      w.meanStepsPerDay != null
        ? ` That is ${kcal(w.meanStepsPerDay)} steps on an average day`
        : "";
    const sleep =
      w.meanSleepHours != null
        ? `${steps ? ", and" : " You slept"} ${w.meanSleepHours.toFixed(1)} hours of sleep a night`
        : "";
    const habits = steps || sleep ? `${steps}${sleep}.` : "";
    cards.push({
      key: "split",
      kicker: "Where it goes",
      value: `${kcal(movingKcal)}`,
      unit: "kcal a day from moving",
      body:
        `Another ${kcal(restingKcal)} kcal goes on simply being alive — heart, lungs, brain, all of it ` +
        `running while you sit still. The rest is you, up and about. ${habits}`,
      note:
        `Walking, standing and fidgeting usually add up to more than exercise does. When a diet stops working, ` +
        `this is often the part that quietly shrank.`,
    });
  }

  if (w.weightChangeKg != null && w.meanIntakeKcal != null) {
    const steady = Math.abs(w.weightChangeKg) < 0.5;
    const rate =
      w.holdLossKgPerWeek != null && Math.abs(w.holdLossKgPerWeek) >= 0.05
        ? `${Math.abs(w.holdLossKgPerWeek).toFixed(2)} kg a week`
        : null;
    const burn = w.measuredMaintenanceKcal;
    cards.push({
      key: "response",
      kicker: "What the scale said",
      value: steady ? "Held steady" : kg(w.weightChangeKg),
      unit: steady
        ? "on maintenance calories"
        : w.weightChangeKg > 0
          ? `lost over ${w.days} days`
          : `gained over ${w.days} days`,
      body: steady
        ? `You averaged ${kcal(w.meanIntakeKcal)} kcal a day and your trend weight stayed where it was. ` +
          `That is what maintenance looks like, and it is the strongest evidence the burn above is right.`
        : w.weightChangeKg > 0
          ? // The case that reads as a contradiction unless it's spelled out: they
            // were told they were eating at maintenance, and lost weight anyway.
            `You averaged ${kcal(w.meanIntakeKcal)} kcal a day and still lost weight${rate ? `, about ${rate}` : ""}. ` +
            `So what was set as your maintenance was already a small deficit` +
            (burn != null
              ? ` — your real burn is nearer ${kcal(burn)} kcal, and that is the figure your new target was worked out from.`
              : `, and your new target allows for it.`)
          : `You averaged ${kcal(w.meanIntakeKcal)} kcal a day and your trend rose ${kg(-w.weightChangeKg)}` +
            `${rate ? `, about ${rate}` : ""}. ` +
            `Some of that is food and water sitting in you on weigh-in day` +
            (burn != null
              ? `; the rest says your burn is nearer ${kcal(burn)} kcal, which is what your new target was worked out from.`
              : `, and your new target allows for it.`),
      note:
        `Single weigh-ins swing a kilo on water alone, so what is read here is the trend line through all of them, ` +
        `not the difference between your first morning and your last.`,
    });
  }

  const t = w.newTarget;
  const burn = w.measuredMaintenanceKcal;
  // Two sentences that used to be one number, which is what made this card read
  // as wrong arithmetic: 1,378 is 231 below a burn of 1,609 AND 322 less food
  // than a hold at 1,700. Both are true, and only naming the first left the
  // other 91 kcal unaccounted for on the reader's own subtraction.
  const versusBurn =
    burn != null ? `${kcal(w.deficitKcal)} kcal below the ${kcal(burn)} kcal you burn` : null;
  const versusPlate =
    w.changeFromHoldKcal > 0
      ? `${kcal(w.changeFromHoldKcal)} kcal less food than the ${kcal(w.holdTargetKcal)} you have been eating`
      : w.changeFromHoldKcal < 0
        ? `${kcal(-w.changeFromHoldKcal)} kcal MORE food than the ${kcal(w.holdTargetKcal)} you have been eating`
        : `the same amount of food you have been eating`;
  cards.push({
    key: "target",
    kicker: replay ? "The target it set" : "What you eat from today",
    value: kcal(t.kcal),
    unit: "kcal a day",
    target: t,
    body:
      (versusBurn ? `That is ${versusBurn}, and ${versusPlate}. ` : `That is ${versusPlate}. `) +
      `Protein is set at ${Math.round(t.protein_g)} g — deliberately high, so what you lose is fat rather than muscle.`,
    note:
      `A first deficit is held to 300–500 kcal a day: enough to show on the scale inside a fortnight, ` +
      `small enough to live with for months. Faster cuts are earned later from real results, not chosen at the start.`,
  });

  if (w.expectedLossKgPerWeek != null) {
    // The comparison that makes the prediction checkable rather than a number to
    // take on faith: they can see the rate they were ALREADY losing at, on more
    // food, and judge whether the new one is plausible.
    const already =
      w.holdLossKgPerWeek != null && w.holdLossKgPerWeek > 0.05
        ? ` You were already losing about ${w.holdLossKgPerWeek.toFixed(2)} kg a week during calibration, on more food than this.`
        : "";
    const goal =
      w.projection?.goalDate != null && w.projection.goalWeeks != null
        ? ` Your goal weight is about ${w.projection.goalWeeks} weeks away at this rate — around ${longDate(w.projection.goalDate)}.`
        : "";
    const band =
      w.inHealthyBand === false
        ? ` This is a cautious rate for your size, chosen on purpose.`
        : "";
    cards.push({
      key: "expect",
      kicker: "What should happen now",
      value: w.expectedLossKgPerWeek.toFixed(2),
      unit: "kg a week",
      chart: w.projection?.points,
      body: `That is what ${kcal(w.newTarget.kcal)} kcal a day works out to for you.${already}${goal}${band}`,
      note:
        `The line flattens because a lighter body burns less: the same target is a smaller deficit every month. ` +
        `Any single week can land a few hundred grams either side of this — the trend across weeks is the real answer.`,
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
            `You are seeing these findings exactly as they were on the day, ${
              endedAt ? longDate(endedAt.slice(0, 10)) : "when this deficit started"
            }. ` +
            `Your targets have moved since — they are reviewed against your results every week.`,
        }
      : {
          key: "start",
          kicker: "Ready",
          value: "Start now",
          body:
            `Tap start and today's target becomes ${kcal(w.newTarget.kcal)} kcal. ` +
            `You can find this review again in Settings whenever you want it.`,
          note:
            `The new target is held for two weeks before anything is adjusted: the first week on new calories ` +
            `is mostly water, so judging it sooner means reacting to noise. After that it is reviewed weekly, ` +
            `and you are asked before any change.`,
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
    // A phone-shaped card deck full-bleed on a phone, and a centred two-column
    // spread on a laptop. Stretched across a wide window it was one small
    // paragraph adrift on the left with a full-width button under it: the layout
    // has to hold the content together as the window grows, not spread it out.
    <main
      className="flex min-h-dvh flex-col gap-6 p-6 text-white lg:justify-center lg:p-12"
      style={{ background: card.grad }}
    >
      {/* Where you are in the review. */}
      <div
        className="mx-auto flex w-full max-w-5xl items-center gap-1.5 pt-2"
        aria-hidden
      >
        {cards.map((c, n) => (
          <span
            key={c.key}
            className="h-1 flex-1 rounded-full transition"
            style={{ background: n <= i ? "white" : "rgba(255,255,255,0.3)" }}
          />
        ))}
      </div>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-4 lg:flex-none lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-14 lg:py-8">
        {/* The finding: kicker, the number itself, what it is. */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
            {card.kicker}
          </p>
          <h1 className="text-6xl font-bold leading-none tracking-tight lg:text-8xl">
            {card.value}
          </h1>
          {card.unit && (
            <p className="-mt-1 text-xl font-semibold text-white/90 lg:text-2xl">
              {card.unit}
            </p>
          )}

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
        </div>

        {/* What it means, and the general point behind it. */}
        <div className="flex flex-col gap-4">
          {card.chart && card.chart.length > 1 && <ProjectionCurve points={card.chart} />}

          <p className="max-w-prose text-lg leading-relaxed text-white lg:text-xl">
            {card.body}
          </p>

          {card.note && (
            <p className="max-w-prose rounded-2xl bg-black/15 p-3 text-sm leading-relaxed text-white/75">
              <span className="font-semibold uppercase tracking-wide">Why: </span>
              {card.note}
            </p>
          )}
        </div>
      </section>

      {err && (
        <p
          className="mx-auto w-full max-w-5xl rounded-2xl bg-white/20 p-3 text-sm font-medium"
          role="alert"
        >
          {err}
        </p>
      )}

      {/* Full width on a phone, thumb-sized. On a laptop the controls sit under
          the left column at a normal button width — a metre-wide Next button is
          not a bigger target, it is a stretched one. */}
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 pb-2 lg:max-w-md lg:self-start">
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
