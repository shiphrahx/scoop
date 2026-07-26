import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

// Shaped like the Pantry — back link, title, add button, then the item list.
export default function PantryLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 pt-6 pb-6 lg:px-8">
      <SkeletonBlock className="h-4 w-16" />
      <SkeletonBlock className="h-8 w-40" />
      <SkeletonBlock className="h-12 w-full rounded-full" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} className="h-16" />
        ))}
      </div>
    </main>
  );
}
