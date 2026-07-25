import { SkeletonBlock, SkeletonCard, SkeletonTitle } from "@/components/Skeleton";

// Shaped like the dashboard that replaces it — action row, KPI tiles, tab strip,
// then the card grid — so the swap doesn't move anything under the user's thumb.
export default function ProgressLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 pt-6 pb-6 lg:max-w-5xl lg:px-8">
      <SkeletonTitle />

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
    </main>
  );
}
