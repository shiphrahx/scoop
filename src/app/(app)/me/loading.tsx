import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

// Shaped like the Me page, avatar, name, then a stack of settings cards, so
// the tap swaps to something the right shape while the profile loads.
export default function MeLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <div className="flex flex-col items-center gap-2">
        <SkeletonBlock className="h-20 w-20 rounded-[1.75rem]" />
        <SkeletonBlock className="h-5 w-32" />
        <SkeletonBlock className="h-3 w-40" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <SkeletonCard key={i} className="h-28" />
      ))}
    </main>
  );
}
