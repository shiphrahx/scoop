import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

// Shaped like Batches — back link, title, the batch list, then the add form.
export default function BatchesLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 pt-6 pb-6 lg:px-8">
      <SkeletonBlock className="h-4 w-16" />
      <SkeletonBlock className="h-8 w-36" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} className="h-20" />
        ))}
      </div>
      <SkeletonCard className="h-40" />
    </main>
  );
}
