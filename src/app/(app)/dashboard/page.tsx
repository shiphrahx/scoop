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
} from "@/lib/queries";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const name =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    "there";

  const [targets, consumed, weightHistory, activity, latestWeight, coachData] =
    await Promise.all([
      getCurrentTargets(),
      getTodayConsumed(),
      getWeightHistory(30),
      getActivityHistory(14),
      getLatestWeight(),
      getCoachData(),
    ]);

  const coach = {
    headline: coachData.review.headline,
    detail: coachData.review.detail,
  };

  return (
    <>
      <MobileHome
        name={name}
        targets={targets}
        consumed={consumed}
        coach={coach}
      />
      <DesktopDashboard
        name={name}
        targets={targets}
        consumed={consumed}
        coach={coach}
        weightHistory={weightHistory}
        activity={activity}
        latestWeight={latestWeight}
      />
    </>
  );
}
