import { SkeletonTitle } from "@/components/Skeleton";
import InsightsSkeleton from "./InsightsSkeleton";

// Shaped like the dashboard that replaces it — title, action row, KPI tiles, tab
// strip, then the card grid — so the swap doesn't move anything under the user's
// thumb. The body is shared with the page's own Suspense fallback.
export default function ProgressLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 pt-6 pb-6 lg:max-w-5xl lg:px-8">
      <SkeletonTitle />
      <InsightsSkeleton />
    </main>
  );
}
