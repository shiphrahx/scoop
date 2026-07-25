import WeightLogger from "./WeightLogger";
import WeightHistory from "./WeightHistory";
import CheckInCard from "./CheckInCard";
import TrendSection from "./insights/TrendSection";
import BodyTab from "./insights/BodyTab";
import DriversTab from "./insights/DriversTab";
import AdherenceSection from "./insights/AdherenceTab";
import MotivationSection from "./insights/MotivationSection";
import { getCurrentCheckIn, getInsightsData } from "@/lib/queries";
import {
  actualVsTarget,
  adherenceVsLoss,
  fatLossSignal,
  goalProgress,
  highDayImpact,
  lossRate,
  milestones,
  movementVsLoss,
  photoPairs,
  plateau,
  projectGoalDate,
  sleepVsLoss,
  trendLine,
  waistToHeight,
  weekScorecard,
  weekdayVsWeekend,
  weeklyBuckets,
  type WeighIn,
} from "@/lib/insights";
import { addDaysISO, weekStartOf } from "@/lib/time";

// How much history the small "see the raw days" charts inside the driver cards
// show. The correlations read months; these are just context for the pattern.
const RAW_CHART_DAYS = 30;

export default async function ProgressPage() {
  const [currentCheckIn, data] = await Promise.all([
    getCurrentCheckIn(),
    getInsightsData(),
  ]);

  const { profile, today } = data;
  const weighIns: WeighIn[] = data.weights.map((w) => ({
    date: w.date,
    kg: w.weight_kg,
  }));

  // Check-ins arrive newest-first; the tape series wants oldest-first.
  const checkInsAsc = [...data.checkIns].sort((a, b) => a.date.localeCompare(b.date));
  const tape = checkInsAsc.map((c) => ({
    date: c.date,
    waist_cm: c.waist_cm,
    hips_cm: c.hips_cm,
    thighs_cm: c.thighs_cm,
    arms_cm: c.arms_cm,
    chest_cm: c.chest_cm,
  }));
  const latestWaist = [...tape].reverse().find((t) => t.waist_cm != null)?.waist_cm ?? null;

  const weeks = weeklyBuckets({
    weighIns,
    intake: data.intake,
    activity: data.activity,
    targets: data.targets,
    highDayDates: data.highDayDates,
  });

  const thisWeek = weekStartOf(today);
  const currentTarget = data.targets.find((t) => t.week_start === thisWeek) ?? null;

  // Raw day series for the expandable detail inside the driver cards.
  const rawCut = addDaysISO(today, -(RAW_CHART_DAYS - 1));
  const recentActivity = data.activity.filter((a) => a.date >= rawCut);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 pt-8 pb-6 lg:px-8">
      <h1 className="text-3xl font-semibold">Progress</h1>

      <CheckInCard done={Boolean(currentCheckIn)} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Daily weight
        </h2>
        <WeightLogger
          last={
            data.weights.length > 0
              ? data.weights[data.weights.length - 1].weight_kg
              : null
          }
        />
      </section>

      <TrendSection
        today={today}
        trend={trendLine(weighIns)}
        rate={profile ? lossRate(weighIns, profile.sex, profile.body_fat_pct) : null}
        projection={projectGoalDate(weighIns, profile?.goal_weight_kg)}
        progress={goalProgress(weighIns, profile?.goal_weight_kg)}
      />

      <BodyTab
        fatLoss={fatLossSignal(weighIns, tape)}
        whtr={waistToHeight(latestWaist, profile?.height_cm)}
        measurements={tape}
        pairs={photoPairs(
          checkInsAsc.map((c) => ({ date: c.date, photos: c.photos })),
        )}
        checkIns={data.checkIns}
      />

      <DriversTab
        sleep={sleepVsLoss(weeks)}
        movement={movementVsLoss(weeks)}
        adherence={adherenceVsLoss(weeks)}
        highDay={highDayImpact(weeks)}
        cyclingEnabled={Boolean(profile?.cycling_enabled)}
        deviceConnected={data.deviceConnected}
        weightSeries={data.weights
          .filter((w) => w.date >= rawCut)
          .map((w) => ({ date: w.date, weight: w.weight_kg }))}
        burnSeries={recentActivity
          .filter((a) => a.workout_kcal != null)
          .map((a) => ({ date: a.date, kcal: a.workout_kcal as number }))}
        sleepSeries={recentActivity
          .filter((a) => a.sleep_hours != null)
          .map((a) => ({ date: a.date, hours: a.sleep_hours as number }))}
      />

      <AdherenceSection
        scorecard={weekScorecard(data.intake, currentTarget, today)}
        weeks={actualVsTarget(data.intake, data.targets)}
        pattern={weekdayVsWeekend(data.intake)}
        hasTarget={data.targets.length > 0}
      />

      <MotivationSection
        board={milestones(weighIns, profile?.goal_weight_kg, data.customMilestones)}
        plateau={plateau(weighIns)}
        victories={data.victories}
        today={today}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          All weigh-ins
        </h2>
        <WeightHistory weights={data.weights} />
      </section>
    </main>
  );
}
