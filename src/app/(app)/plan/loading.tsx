import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

// Shaped like the Plan hub — the big "plan my day" call to action, then the
// meal-planner card and the shortcut rows.
export default function PlanLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 pt-8 pb-6 lg:px-8">
      <SkeletonBlock className="h-8 w-32" />
      <SkeletonCard className="h-24" />
      <SkeletonCard className="h-56" />
      <SkeletonCard className="h-16" />
      <SkeletonCard className="h-16" />
    </main>
  );
}
