import Link from "next/link";
import { Scale, Flame, Beef, Moon, Sparkles, ChevronRight } from "lucide-react";
import ProgressRing from "@/components/ProgressRing";
import MacroBar from "@/components/MacroBar";
import SignOutButton from "@/components/SignOutButton";
import { WeightTrendChart, WeightVsExercise, SleepChart } from "@/components/Charts";
import type { Activity, DailyTargets, Macros } from "@/lib/types";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: typeof Scale;
  label: string;
  value: string;
  sub?: string;
  tint: string;
}) {
  return (
    <div className="sc-card flex items-center gap-4 p-5">
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
    </div>
  );
}

export default function DesktopDashboard({
  name,
  targets,
  consumed,
  coach,
  weightHistory,
  activity,
  latestWeight,
}: {
  name: string;
  targets: DailyTargets | null;
  consumed: Macros;
  coach: { headline: string; detail: string };
  weightHistory: { date: string; weight_kg: number }[];
  activity: Activity[];
  latestWeight: number | null;
}) {
  const kcalLeft = targets ? Math.max(0, Math.round(targets.kcal - consumed.kcal)) : 0;
  const proteinLeft = targets
    ? Math.max(0, Math.round(targets.protein_g - consumed.protein_g))
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
          <section className="sc-card flex flex-col items-center gap-4 p-6">
            <h2 className="self-start text-lg font-semibold">Today</h2>
            {targets ? (
              <>
                <ProgressRing value={consumed.kcal} max={targets.kcal} size={190} stroke={18}>
                  <div>
                    <p className="text-5xl font-bold tabular-nums leading-tight">
                      {kcalLeft}
                    </p>
                    <p className="text-xs text-[var(--muted)]">kcal left</p>
                  </div>
                </ProgressRing>
                <div className="flex w-full flex-col gap-3">
                  <MacroBar
                    label="Protein"
                    consumed={consumed.protein_g}
                    target={targets.protein_g}
                    gradient="linear-gradient(90deg, var(--g-green), var(--g-teal))"
                  />
                  <MacroBar
                    label="Carbs"
                    consumed={consumed.carbs_g}
                    target={targets.carbs_g}
                    gradient="linear-gradient(90deg, var(--g-teal), var(--g-blue))"
                  />
                  <MacroBar
                    label="Fat"
                    consumed={consumed.fat_g}
                    target={targets.fat_g}
                    gradient="linear-gradient(90deg, var(--g-blue), var(--accent))"
                  />
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--muted)]">
                Finish onboarding to see your targets.
              </p>
            )}
          </section>

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
