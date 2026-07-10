import MobileHome from "@/components/home/MobileHome";
import DesktopDashboard from "@/components/home/DesktopDashboard";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentTargets,
  getTodayConsumed,
  getWeightHistory,
  getActivityHistory,
  getLatestWeight,
  getCoachData,
  hasTrackedToday,
  getTodayPlan,
  getProfile,
} from "@/lib/queries";
import { normalizePrefs } from "@/lib/nutrients";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const name =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    "there";

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
    getCurrentTargets(),
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
      <MobileHome
        name={name}
        targets={targets}
        consumed={consumed}
        coach={coach}
        planPrompt={planPrompt}
        prefs={prefs}
      />
      <DesktopDashboard
        name={name}
        targets={targets}
        consumed={consumed}
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
