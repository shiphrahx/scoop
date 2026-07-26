import { getCoachData } from "@/lib/queries";
import { CalibrationBanner } from "@/components/home/MobileHome";
import { SkeletonBlock } from "@/components/Skeleton";

// The coach headline + detail, streamed on its own. Computing the weekly review
// is the slowest data path on Home (a batch of reads plus a 28-day intake scan),
// and all it feeds is these two lines — so it renders behind its own Suspense
// boundary while the calorie ring, which needs none of it, paints immediately.
export async function CoachText() {
  const { review } = await getCoachData();
  return (
    <>
      <p className="font-semibold">{review.headline}</p>
      <p className="truncate text-sm text-[var(--muted)]">{review.detail}</p>
    </>
  );
}

// What shows in the coach card's two lines while the review is still computing.
export function CoachTextSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <SkeletonBlock className="h-4 w-40" />
      <SkeletonBlock className="h-3 w-56" />
    </div>
  );
}

// The new-user calibration banner, streamed with the coach data it comes from.
// Null (nothing) until the data resolves; the banner only ever shows in a user's
// first couple of weeks, so there's no skeleton to hold space for it.
export async function CalibrationSlot() {
  const data = await getCoachData();
  if (!data.calibrationActive) return null;
  return <CalibrationBanner daysRemaining={data.calibrationDaysRemaining} />;
}
