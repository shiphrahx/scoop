import ActionBar from "./ActionBar";
import Tabs from "./insights/Tabs";
import OverviewTab from "./insights/OverviewTab";
import BodyTab from "./insights/BodyTab";
import DriversTab from "./insights/DriversTab";
import AdherenceTab from "./insights/AdherenceTab";
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
import { addDaysISO } from "@/lib/time";

// How much history the small "see the raw days" charts inside the driver cards
// show. The correlations read months; these are just context for the pattern.
const RAW_CHART_DAYS = 30;

// The whole insights body — the ActionBar and the four chart tabs — fetched and
// rendered here so the page can stream it. This is the heavy part of Progress
// (getInsightsData is ~a dozen reads and the tabs draw charts), so the page
// header paints immediately and this fills in behind a Suspense boundary.
export default async function Insights() {
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

  // The target the app is actually holding the user to, resolved once in the
  // query layer. Picking this week's row out of the raw history instead meant
  // the scorecard could grade against a row the app itself was overriding — a
  // week with no row of its own scored against nothing, and a calibration week
  // scored against a drifted number rather than the pinned anchor.
  const currentTarget = data.currentTarget;

  // Raw day series for the expandable detail inside the driver cards.
  const rawCut = addDaysISO(today, -(RAW_CHART_DAYS - 1));
  const recentActivity = data.activity.filter((a) => a.date >= rawCut);

  const latestWeight =
    data.weights.length > 0 ? data.weights[data.weights.length - 1] : null;

  return (
    <>
      <ActionBar
        last={latestWeight?.weight_kg ?? null}
        loggedToday={latestWeight?.date === today}
        checkedIn={Boolean(currentCheckIn)}
      />

      <Tabs
        tabs={[
          {
            key: "overview",
            label: "Overview",
            content: (
              <OverviewTab
                today={today}
                trend={trendLine(weighIns)}
                rate={
                  profile ? lossRate(weighIns, profile.sex, profile.body_fat_pct) : null
                }
                projection={projectGoalDate(weighIns, profile?.goal_weight_kg)}
                progress={goalProgress(weighIns, profile?.goal_weight_kg)}
                weights={data.weights}
                fatLoss={fatLossSignal(weighIns, tape)}
                plateau={plateau(weighIns)}
                scorecard={weekScorecard(data.intake, currentTarget, today, {
                  highDayDates: data.highDayDates,
                  config: data.cycle,
                })}
                hasTarget={currentTarget != null}
                board={milestones(
                  weighIns,
                  profile?.goal_weight_kg,
                  data.customMilestones,
                )}
              />
            ),
          },
          {
            key: "body",
            label: "Body",
            content: (
              <BodyTab
                whtr={waistToHeight(latestWaist, profile?.height_cm)}
                measurements={tape}
                pairs={photoPairs(
                  checkInsAsc.map((c) => ({ date: c.date, photos: c.photos })),
                )}
                checkIns={data.checkIns}
              />
            ),
          },
          {
            key: "drivers",
            label: "Drivers",
            content: (
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
            ),
          },
          {
            key: "adherence",
            label: "Adherence",
            content: (
              <AdherenceTab
                weeks={actualVsTarget(data.intake, data.targets)}
                pattern={weekdayVsWeekend(data.intake)}
                victories={data.victories}
                today={today}
              />
            ),
          },
        ]}
      />
    </>
  );
}
