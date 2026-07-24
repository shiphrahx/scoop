import AutoReview from "@/app/(app)/coach/AutoReview";
import MobileHome from "@/components/home/MobileHome";
import DesktopDashboard from "@/components/home/DesktopDashboard";
import { createClient } from "@/lib/supabase/server";
import {
  getDayTarget,
  getTodayConsumed,
  getWeightHistory,
  getActivityHistory,
  getLatestWeight,
  getCoachData,
  hasTrackedToday,
  getTodayPlan,
  getProfile,
  localToday,
} from "@/lib/queries";
import { normalizePrefs } from "@/lib/nutrients";
import { sumMacros } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const name =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    "there";

  // The home ring shows TODAY's target — a high or low day when cycling is on,
  // the flat base when it's off.
  const [
    targets,
    consumed,
    weightHistory,
    activity,
    latestWeight,
    coachData,
    trackedToday,
    plan,
    profile,
  ] = await Promise.all([
    getDayTarget(await localToday()),
    getTodayConsumed(),
    getWeightHistory(30),
    getActivityHistory(14),
    getLatestWeight(),
    getCoachData(),
    hasTrackedToday(),
    getTodayPlan(),
    getProfile(),
  ]);

  const prefs = normalizePrefs(profile?.nutrient_prefs);

  // Meals lined up in the day planner but not eaten yet. "Calories left" counts
  // these against the target too, so the home ring reflects the day the user
  // planned — not only what they've already eaten. Eaten planned meals are
  // excluded here (they already show up in `consumed` via their food log).
  const planned = sumMacros(plan.filter((p) => !p.logged_food_id));

  const coach = {
    headline: coachData.review.headline,
    detail: coachData.review.detail,
  };

  // Nudge to plan the day until something's been logged. Label adapts to
  // whether a plan already exists.
  const planPrompt = !trackedToday
    ? { hasPlan: plan.length > 0 }
    : null;

  return (
    <>
      {/* Keeps the weekly review moving without the user having to ask for it. */}
      <AutoReview />
      <MobileHome
        name={name}
        targets={targets}
        consumed={consumed}
        planned={planned}
        coach={coach}
        planPrompt={planPrompt}
        prefs={prefs}
      />
      <DesktopDashboard
        name={name}
        targets={targets}
        consumed={consumed}
        planned={planned}
        coach={coach}
        weightHistory={weightHistory}
        activity={activity}
        latestWeight={latestWeight}
        planPrompt={planPrompt}
        prefs={prefs}
      />
    </>
  );
}
