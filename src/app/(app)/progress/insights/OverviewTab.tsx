"use client";

// Overview: the answer to "how is this going", in one screen.
//
// Four figures across the top, one chart under them, then compact cards — the
// ones with data first, then quiet dashed ones naming what the missing data
// would buy. Everything deeper — the bands behind the rate, the window behind
// the date, the weigh-in log — is a tap into a drawer, because a dashboard that
// shows all of it at once is a page nobody scrolls twice.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CircleCheck,
  Plus,
  Scale,
  Sparkles,
  Trash2,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { TrendDotsChart } from "@/components/ChartsLazy";
import { addDaysISO } from "@/lib/time";
import type {
  FatLossSignal,
  GoalProgress,
  GoalProjection,
  LossRate,
  MilestoneBoard,
  Plateau,
  TrendPoint,
  WeekScorecard,
} from "@/lib/insights";
import WeightHistory from "../WeightHistory";
import { addMilestone, deleteMilestone, setMilestoneReached } from "../actions";
import {
  CompactCard,
  Expandable,
  Hero,
  InsightGrid,
  KpiRow,
  KpiTile,
  NeedsMoreData,
  StatRow,
  fmt,
  signed,
  type LockedInsight,
} from "./ui";

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

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

const VERDICT: Record<LossRate["verdict"], { text: string; tone: "good" | "warn" }> = {
  "on-track": {
    text: "Within the healthy band for your body.",
    tone: "good",
  },
  slow: {
    text: "Below your healthy band. Acceptable if intended — the Coach will adjust the target if it stays here.",
    tone: "warn",
  },
  fast: {
    text: "Above your healthy band. Losing at this rate costs muscle as well as fat.",
    tone: "warn",
  },
  gaining: {
    text: "The trend has risen over the last week.",
    tone: "warn",
  },
};

const CONFIDENCE: Record<GoalProjection["confidence"], string> = {
  high: "The trend has been steady, so this window is a reliable estimate.",
  medium: "The trend varies somewhat — treat this as an approximate window.",
  low: "The trend is noisy, so this window is wide. It will narrow as you log more.",
};

export default function OverviewTab({
  today,
  trend,
  rate,
  projection,
  progress,
  weights,
  fatLoss,
  plateau,
  scorecard,
  hasTarget,
  board,
}: {
  // The user's local today, resolved on the server. The browser clock is not
  // the user's day and must not decide what "last week" means.
  today: string;
  trend: TrendPoint[];
  rate: LossRate | null;
  projection: GoalProjection | null;
  progress: GoalProgress | null;
  weights: { date: string; weight_kg: number }[];
  fatLoss: FatLossSignal | null;
  plateau: Plateau | null;
  scorecard: WeekScorecard;
  hasTarget: boolean;
  board: MilestoneBoard;
}) {
  const latest = weights.length > 0 ? weights[weights.length - 1] : null;
  const locked: LockedInsight[] = [];

  if (trend.length === 0) {
    locked.push({
      title: "Weight trend",
      why: "Your real weight line, with the daily water noise smoothed out. Weigh in on four separate days.",
    });
  }
  if (rate == null) {
    locked.push({
      title: "Rate of loss",
      why: "How fast you're losing, against the healthy band for your body. Needs a week of weigh-ins.",
    });
  }
  if (projection == null) {
    locked.push({
      title: "Goal date",
      why: "The date you're on course to hit your goal. Needs three weeks of weigh-ins on a falling trend, plus a goal weight.",
    });
  }
  if (progress == null) {
    locked.push({
      title: "The journey",
      why: "How far you've come from your start weight towards your goal. Set a goal weight on your profile.",
    });
  }
  if (!hasTarget) {
    locked.push({
      title: "This week",
      why: "The days you hit calories and protein this week. Finish onboarding so the Coach sets a target.",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <KpiRow>
        {latest ? (
          <KpiTile
            label="Now"
            value={fmt(latest.weight_kg)}
            unit="kg"
            detailTitle="All weigh-ins"
            detail={<WeightHistory weights={weights} />}
          />
        ) : null}

        {rate ? (
          <KpiTile
            label="Per week"
            value={signed(-rate.kgPerWeek, 2)}
            unit="kg"
            tone={VERDICT[rate.verdict].tone}
            detailTitle="Rate of loss"
            detail={<RateDetail rate={rate} />}
          />
        ) : null}

        {progress ? (
          <KpiTile
            label="To goal"
            value={`${progress.pctComplete}`}
            unit="%"
            tone={progress.reached ? "good" : "cool"}
            detailTitle="The journey"
            detail={<JourneyDetail progress={progress} />}
          />
        ) : null}

        {projection ? (
          <KpiTile
            label="Goal date"
            value={shortDate(projection.midpoint)}
            detailTitle="Goal date"
            detail={<ProjectionDetail projection={projection} />}
          />
        ) : null}
      </KpiRow>

      {/* The callout only appears when it's earned — a permanent "you might be
          losing fat!" panel would mean nothing the week it's actually true. */}
      {fatLoss?.detected ? (
        <div className="sc-grad-panel flex flex-col gap-2 p-4">
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

      {plateau?.detected ? (
        <div className="sc-card flex flex-col gap-2 border-l-4 border-l-[var(--accent)] p-4">
          <div className="flex items-center gap-2">
            <TriangleAlert size={18} className="text-[var(--accent)]" />
            <span className="font-semibold">The trend has stalled</span>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Your trend weight has moved {fmt(Math.abs(plateau.changeKg), 2)} kg in{" "}
            {plateau.weeks} weeks. That&apos;s usually not a reason to cut further — a long
            deficit lowers what you burn, and the fix is a diet break or a fresh
            maintenance measurement.
          </p>
          <Link href="/coach" className="sc-btn sc-btn-soft self-start">
            Ask the Coach
          </Link>
        </div>
      ) : null}

      {trend.length > 0 ? <TrendCard today={today} trend={trend} /> : null}

      <InsightGrid locked={locked}>
        {hasTarget ? (
          <CompactCard
            icon={<CircleCheck size={16} />}
            title="This week"
            detail={<ScorecardDetail scorecard={scorecard} />}
          >
            <Hero
              size="sm"
              value={`${scorecard.kcalHitDays}/${scorecard.daysSoFar}`}
              label={`days on calories · ${scorecard.streakDays} day streak`}
              tone={
                scorecard.kcalHitDays >= scorecard.daysSoFar - 1 ? "good" : "cool"
              }
            />
          </CompactCard>
        ) : null}

        <MilestonesCard board={board} />
      </InsightGrid>
    </div>
  );
}

// The one chart the page leads with. The trend itself is always computed over
// the FULL history; the range only decides how much of it is on screen —
// recomputing per range would give the "week" view a line that starts from
// scratch every Monday.
function TrendCard({ today, trend }: { today: string; trend: TrendPoint[] }) {
  const [range, setRange] = useState<Range>("month");

  const shown = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    const cutoff = addDaysISO(today, -(days - 1));
    return trend.filter((p) => p.date >= cutoff);
  }, [trend, range, today]);

  return (
    <div className="sc-card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--fill)] text-[var(--muted)]">
          <Scale size={16} />
        </span>
        <span className="text-sm font-semibold">Weight</span>
        <div className="ml-auto flex gap-1.5">
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
      <TrendDotsChart data={shown} />
    </div>
  );
}

function RateDetail({ rate }: { rate: LossRate }) {
  return (
    <>
      <Hero
        value={fmt(rate.kgPerWeek, 2)}
        unit="kg / week"
        label={`${fmt(rate.pctPerWeek, 2)}% of your bodyweight`}
        tone={VERDICT[rate.verdict].tone}
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
  );
}

function ProjectionDetail({ projection }: { projection: GoalProjection }) {
  return (
    <>
      <Hero
        value={
          projection.latest
            ? `${longDate(projection.earliest)} – ${longDate(projection.latest)}`
            : `${longDate(projection.earliest)} or later`
        }
        label={`around ${projection.weeksMid} weeks at this rate`}
      />
      <p className="text-sm text-[var(--muted)]">{CONFIDENCE[projection.confidence]}</p>
      <StatRow
        stats={[
          { label: "Middle estimate", value: longDate(projection.midpoint) },
          { label: "Left to lose", value: `${fmt(projection.remainingKg)} kg` },
          { label: "Confidence", value: projection.confidence },
        ]}
      />
    </>
  );
}

function JourneyDetail({ progress }: { progress: GoalProgress }) {
  return (
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
  );
}

function ScorecardDetail({ scorecard }: { scorecard: WeekScorecard }) {
  return (
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
        Week of {shortDate(scorecard.weekStart)}. Calories count as hit within 15% of the
        target; protein counts once you reach 90% of it.
      </p>
    </>
  );
}

// Milestones carry an add form, so unlike an insight this card renders whether
// or not there's anything on the board yet — otherwise there'd be nowhere to
// write down the first one.
function MilestonesCard({ board }: { board: MilestoneBoard }) {
  const empty = board.reached.length === 0 && board.next == null;

  return (
    <CompactCard
      icon={<Trophy size={16} />}
      title="Milestones"
      detail={<MilestonesDetail board={board} />}
    >
      {board.next ? (
        <Hero
          size="sm"
          value={board.toNextKg != null ? fmt(board.toNextKg) : "—"}
          unit={board.toNextKg != null ? "kg" : undefined}
          label={`to ${board.next.label}`}
        />
      ) : (
        <Hero
          size="sm"
          value={`${board.reached.length}`}
          label={empty ? "none yet — add your own" : "all reached"}
          tone={empty ? "cool" : "good"}
        />
      )}
    </CompactCard>
  );
}

function MilestonesDetail({ board }: { board: MilestoneBoard }) {
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await addMilestone(label, target.trim() === "" ? null : Number(target));
      setLabel("");
      setTarget("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {board.reached.length === 0 && board.next == null ? (
        <NeedsMoreData what="weigh in a few times and the first kilo marker appears." />
      ) : (
        <>
          {board.next ? (
            <p className="text-sm text-[var(--foreground)]">
              Next up: <span className="font-semibold">{board.next.label}</span>
              {board.toNextKg != null ? (
                <span className="text-[var(--muted)]"> — {fmt(board.toNextKg)} kg to go</span>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-[var(--foreground)]">
              Every milestone on the board is behind you.
            </p>
          )}

          {board.reached.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {board.reached.slice(0, 6).map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-xl bg-[var(--tint-green)] px-3 py-2 text-sm"
                >
                  <span className="font-medium">{m.label}</span>
                  <span className="text-[var(--muted)]">
                    {m.reachedOn ? longDate(m.reachedOn) : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {board.reached.length > 6 ? (
            <Expandable label={`All ${board.reached.length} milestones`}>
              <ul className="flex flex-col gap-1.5">
                {board.reached.slice(6).map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-xl bg-[var(--fill-soft)] px-3 py-2 text-sm"
                  >
                    <span>{m.label}</span>
                    <span className="text-[var(--muted)]">
                      {m.reachedOn ? longDate(m.reachedOn) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Expandable>
          ) : null}
        </>
      )}

      <Expandable label="Add your own milestone">
        <div className="flex flex-col gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Fit my old jeans"
            className="sc-input"
            maxLength={60}
          />
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            inputMode="decimal"
            placeholder="Target weight in kg (optional)"
            className="sc-input"
          />
          <p className="text-xs text-[var(--muted)]">
            With a weight, it ticks itself off when your trend passes it. Without one, you
            tick it off yourself.
          </p>
          {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
          <button
            onClick={add}
            disabled={busy || label.trim() === ""}
            className="sc-btn sc-btn-soft self-start"
          >
            <Plus size={16} /> {busy ? "Adding…" : "Add milestone"}
          </button>
        </div>
      </Expandable>

      {/* Hand-ticked milestones live here rather than in the reached list, so
          there's somewhere to tick them off from. */}
      <ManualMilestones board={board} />
    </>
  );
}

function ManualMilestones({ board }: { board: MilestoneBoard }) {
  const custom = [
    ...board.reached.filter((m) => m.kind === "custom"),
    ...(board.next && board.next.kind === "custom" ? [board.next] : []),
  ];
  const manual = custom.filter((m) => m.targetWeightKg == null);
  const [busy, setBusy] = useState<string | null>(null);

  if (manual.length === 0) return null;

  return (
    <Expandable label="Your own milestones">
      <ul className="flex flex-col gap-1.5">
        {manual.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-2 rounded-xl bg-[var(--fill-soft)] px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={m.reached}
              disabled={busy === m.id}
              onChange={async (e) => {
                setBusy(m.id);
                try {
                  await setMilestoneReached(m.id, e.target.checked);
                } finally {
                  setBusy(null);
                }
              }}
              className="h-5 w-5 accent-[var(--g-green)]"
            />
            <span className={m.reached ? "text-[var(--muted)] line-through" : ""}>
              {m.label}
            </span>
            <button
              onClick={async () => {
                setBusy(m.id);
                try {
                  await deleteMilestone(m.id);
                } finally {
                  setBusy(null);
                }
              }}
              className="ml-auto text-[var(--muted)]"
              aria-label={`Delete ${m.label}`}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    </Expandable>
  );
}
