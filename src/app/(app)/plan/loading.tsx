import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

// The fallback for /plan/day, which is the only page under /plan without a
// loading.tsx of its own (the hub this used to be shaped like is gone).
// Heading, then the day stepper, then the meal list.
export default function PlanLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 pt-8 pb-6 lg:px-8">
      <SkeletonBlock className="h-8 w-40" />
      <SkeletonCard className="h-11" />
      <SkeletonCard className="h-14" />
      <SkeletonCard className="h-64" />
    </main>
  );
}
