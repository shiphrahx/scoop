import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

// Shaped like the meal picker, back link, title, then the food group grid.
export default function MealLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 pt-6 pb-6 lg:px-8">
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="h-8 w-40" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SkeletonCard key={i} className="h-24" />
        ))}
      </div>
    </main>
  );
}
