import { Suspense } from "react";
import AutoReview from "@/app/(app)/coach/AutoReview";
import MobileHome from "@/components/home/MobileHome";
import DesktopHome from "@/components/home/DesktopHome";
import {
  CoachText,
  CoachTextSkeleton,
  CalibrationSlot,
} from "@/app/(app)/dashboard/CoachSlots";
import { getSessionUser } from "@/lib/auth";
import {
  getDayTarget,
  getTodayConsumed,
  hasTrackedToday,
  getTodayPlan,
  getProfile,
  localToday,
} from "@/lib/queries";
import { normalizePrefs } from "@/lib/nutrients";
import { sumMacros } from "@/lib/types";

export default async function DashboardPage() {
  const user = await getSessionUser();

  const name =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    "there";

  // The home ring shows TODAY's target — a high or low day when cycling is on,
  // the flat base when it's off. The weekly review (getCoachData) is NOT in this
  // batch: it's the slowest read on the page, and the ring needs none of it, so
  // it streams in its own Suspense boundary below. This await now waits on one
  // round trip of light queries, not the coach's heavier scans.
  const [targets, consumed, trackedToday, plan, profile] = await Promise.all([
    // Not `await localToday()` inline: awaiting it here would hold up all the
    // queries below behind one round trip before any of them started.
    localToday().then(getDayTarget),
    getTodayConsumed(),
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

  // Nudge to plan the day until something's been logged. Label adapts to
  // whether a plan already exists.
  const planPrompt = !trackedToday
    ? { hasPlan: plan.length > 0 }
    : null;

  // Streamed slots. getCoachData is cached, so mobile and desktop share one
  // computation; each renders its coach text behind its own boundary.
  const coachSlot = (
    <Suspense fallback={<CoachTextSkeleton />}>
      <CoachText />
    </Suspense>
  );
  const desktopCoachSlot = (
    <Suspense fallback={<CoachTextSkeleton />}>
      <CoachText />
    </Suspense>
  );
  const calibrationSlot = (
    <Suspense fallback={null}>
      <CalibrationSlot />
    </Suspense>
  );
  const desktopCalibrationSlot = (
    <Suspense fallback={null}>
      <CalibrationSlot />
    </Suspense>
  );

  return (
    <>
      {/* Keeps the weekly review moving without the user having to ask for it. */}
      <AutoReview />
      <MobileHome
        name={name}
        targets={targets}
        consumed={consumed}
        planned={planned}
        coach={coachSlot}
        planPrompt={planPrompt}
        prefs={prefs}
        calibration={calibrationSlot}
      />
      {/* Desktop charts fetch their own data (a phone never shows them), so they
          stream here instead of blocking the mobile ring. Fallback is null: it's
          `hidden lg:flex` markup, and DesktopDashboardMount brings its own
          skeleton once a desktop client mounts. */}
      <Suspense fallback={null}>
        <DesktopHome
          name={name}
          targets={targets}
          consumed={consumed}
          planned={planned}
          coach={desktopCoachSlot}
          planPrompt={planPrompt}
          prefs={prefs}
          calibration={desktopCalibrationSlot}
        />
      </Suspense>
    </>
  );
}
