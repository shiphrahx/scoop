import { SkeletonCard, SkeletonTitle } from "@/components/Skeleton";

// The shared fallback for every signed-in screen that hasn't got its own.
//
// The layout (and so the nav) stays mounted across a navigation, so this is all
// the user sees change: the tap registers instantly and the content swaps in
// when the server answers, instead of the whole app appearing to hang.
export default function AppLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 pt-6 pb-6 lg:max-w-5xl lg:px-8">
      <SkeletonTitle />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonCard className="h-48" />
      <SkeletonCard className="h-32" />
    </main>
  );
}
