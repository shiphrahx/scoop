import Link from "next/link";
import { Scale, Flame, Beef, Moon, Sparkles, ChevronRight, CalendarCheck } from "lucide-react";
import ProgressRing from "@/components/ProgressRing";
import { NutrientBars } from "@/components/NutrientBreakdown";
import SignOutButton from "@/components/SignOutButton";
import { WeightTrendChart, WeightVsExercise, SleepChart } from "@/components/Charts";
import { sumMacros, type Activity, type DailyTargets, type Macros } from "@/lib/types";
import type { NutrientKey } from "@/lib/nutrients";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tint,
  href,
}: {
  icon: typeof Scale;
  label: string;
  value: string;
  sub?: string;
  tint: string;
  href?: string;
}) {
  const inner = (
    <>
      <span
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white"
        style={{ background: tint }}
      >
        <Icon size={22} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
          {label}
        </p>
        <p className="text-2xl font-bold leading-tight tabular-nums">{value}</p>
        {sub && <p className="truncate text-xs text-[var(--muted)]">{sub}</p>}
      </div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="sc-card flex items-center gap-4 p-5 transition hover:brightness-95"
      >
        {inner}
      </Link>
    );
  }
  return <div className="sc-card flex items-center gap-4 p-5">{inner}</div>;
}

export default function DesktopDashboard({
  name,
  targets,
  consumed,
  planned,
  coach,
  weightHistory,
  activity,
  latestWeight,
  planPrompt,
  prefs,
}: {
  name: string;
  targets: DailyTargets | null;
  consumed: Macros;
  planned: Macros;
  coach: { headline: string; detail: string };
  weightHistory: { date: string; weight_kg: number }[];
  activity: Activity[];
  latestWeight: number | null;
  planPrompt: { hasPlan: boolean } | null;
  prefs: NutrientKey[];
}) {
  // Eaten food plus meals planned for later today — what the day is committed
  // to. "Left" figures budget against this, not eaten alone.
  const committed = sumMacros([consumed, planned]);
  const kcalLeft = targets ? Math.max(0, Math.round(targets.kcal - committed.kcal)) : 0;
  const proteinLeft = targets
    ? Math.max(0, Math.round(targets.protein_g - committed.protein_g))
    : 0;

  const weightPts = weightHistory.map((w) => ({
    date: w.date,
    weight: Math.round(w.weight_kg * 10) / 10,
  }));
  const weightChange =
    weightHistory.length >= 2
      ? weightHistory[weightHistory.length - 1].weight_kg - weightHistory[0].weight_kg
      : null;

  const burnPts = activity
    .filter((a) => a.workout_kcal != null)
    .map((a) => ({ date: a.date, kcal: Math.round(Number(a.workout_kcal)) }));
  const sleepPts = activity
    .filter((a) => a.sleep_hours != null)
    .map((a) => ({ date: a.date, hours: Math.round(Number(a.sleep_hours) * 10) / 10 }));
  const avgSleep = sleepPts.length
    ? sleepPts.reduce((s, p) => s + p.hours, 0) / sleepPts.length
    : null;

  return (
    <main className="hidden flex-1 flex-col gap-6 px-6 py-8 lg:flex">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm text-[var(--muted)]">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="text-3xl font-semibold">Welcome back, {name}</h1>
        </div>
        <SignOutButton />
      </header>

      {planPrompt && (
        <Link
          href="/plan/day"
          className="flex items-center gap-4 rounded-[1.75rem] p-5 text-white transition hover:brightness-[1.02]"
          style={{ background: "var(--grad-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20">
            <CalendarCheck size={24} />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold">
              {planPrompt.hasPlan ? "Continue today's plan" : "Plan my day"}
            </p>
            <p className="truncate text-sm text-white/80">
              {planPrompt.hasPlan
                ? "Pick up where you left off"
                : "Nothing logged yet — line up your meals for the day"}
            </p>
          </div>
          <ChevronRight size={22} className="ml-auto shrink-0 text-white/80" />
        </Link>
      )}

      {/* Stat cards */}
      <section className="grid grid-cols-4 gap-4">
        <StatCard
          icon={Scale}
          label="Weight"
          value={latestWeight != null ? `${latestWeight.toFixed(1)} kg` : "—"}
          sub={
            weightChange != null
              ? `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)} kg over ${weightHistory.length} logs`
              : "Log your weight"
          }
          tint="var(--grad-primary)"
          href="/progress"
        />
        <StatCard
          icon={Flame}
          label="Calories left"
          value={targets ? `${kcalLeft}` : "—"}
          sub={targets ? `of ${Math.round(targets.kcal)} kcal` : "Set a target"}
          tint="var(--grad-warm)"
        />
        <StatCard
          icon={Beef}
          label="Protein left"
          value={targets ? `${proteinLeft} g` : "—"}
          sub={targets ? `of ${Math.round(targets.protein_g)} g` : "Set a target"}
          tint="var(--grad-cool)"
        />
        <StatCard
          icon={Moon}
          label="Sleep"
          value={avgSleep != null ? `${avgSleep.toFixed(1)} h` : "—"}
          sub={avgSleep != null ? "nightly average" : "Connect a device"}
          tint="var(--grad-indigo)"
        />
      </section>

      {/* Charts (2fr) + today summary (1fr) */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 flex flex-col gap-6">
          <section className="sc-card p-6">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Weight trend</h2>
              <span className="text-sm text-[var(--muted)]">last 30 days</span>
            </div>
            <WeightTrendChart data={weightPts} height={200} />
          </section>

          <div className="grid grid-cols-2 gap-6">
            <section className="sc-card p-6">
              <h2 className="mb-2 text-lg font-semibold">Weight vs exercise</h2>
              <WeightVsExercise weights={weightPts} burn={burnPts} height={200} />
            </section>
            <section className="sc-card p-6">
              <h2 className="mb-2 text-lg font-semibold">Sleep</h2>
              <SleepChart data={sleepPts} height={200} />
            </section>
          </div>
        </div>

        {/* Today summary */}
        <div className="flex flex-col gap-6">
          <Link
            href="/plan/day"
            className="sc-card flex flex-col items-center gap-4 p-6 transition hover:brightness-[1.01]"
          >
            <h2 className="self-start text-lg font-semibold">Today</h2>
            {targets ? (
              <>
                <ProgressRing value={committed.kcal} max={targets.kcal} size={190} stroke={18}>
                  <div>
                    <p className="text-5xl font-bold tabular-nums leading-tight">
                      {kcalLeft}
                    </p>
                    <p className="text-xs text-[var(--muted)]">kcal left</p>
                  </div>
                </ProgressRing>
                <div className="flex w-full flex-col gap-3">
                  <NutrientBars prefs={prefs} consumed={committed} target={targets} />
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--muted)]">
                Finish onboarding to see your targets.
              </p>
            )}
          </Link>

          <Link
            href="/coach"
            className="sc-card flex items-center gap-4 p-5 transition hover:brightness-[1.01]"
          >
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white"
              style={{ background: "var(--grad-cool)" }}
            >
              <Sparkles size={22} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{coach.headline}</p>
              <p className="truncate text-sm text-[var(--muted)]">{coach.detail}</p>
            </div>
            <ChevronRight size={20} className="ml-auto shrink-0 text-[var(--muted)]" />
          </Link>
        </div>
      </div>
    </main>
  );
}
