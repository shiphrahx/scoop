import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

// Shaped like the weekly check-in — back link, title, then the form card.
export default function CheckInLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 pt-6 pb-6 lg:px-8">
      <SkeletonBlock className="h-4 w-16" />
      <SkeletonBlock className="h-8 w-36" />
      <SkeletonCard className="h-96" />
    </main>
  );
}
