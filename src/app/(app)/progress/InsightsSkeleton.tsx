import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

// The insights body placeholder, action row, KPI tiles, tab strip, card grid,
// shown while the real ActionBar + tabs stream in. Shared by the page's Suspense
// fallback and the route's loading.tsx so both match the real layout and nothing
// jumps under the user's thumb when the content arrives.
export default function InsightsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBlock className="h-12" />
        <SkeletonBlock className="h-12" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sc-card flex flex-col gap-2 p-4">
            <SkeletonBlock className="h-3 w-12" />
            <SkeletonBlock className="h-6 w-16" />
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 py-2">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>

      <SkeletonCard className="h-56" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </>
  );
}
