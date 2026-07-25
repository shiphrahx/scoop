import { SkeletonBlock } from "@/components/Skeleton";

// Home is the screen every tab bounces off, so its placeholder mirrors the real
// layout closely: greeting, coach strip, the calorie ring, then quick actions.
export default function DashboardLoading() {
  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-8 pb-6">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-3 w-12" />
          <SkeletonBlock className="h-7 w-36" />
        </div>
        <SkeletonBlock className="h-10 w-10 rounded-full" />
      </header>

      <SkeletonBlock className="h-24 rounded-[1.75rem]" />

      <section className="sc-card flex flex-col items-center gap-3 px-6 py-8">
        <SkeletonBlock className="h-40 w-40 rounded-full" />
        <SkeletonBlock className="h-3 w-32" />
      </section>

      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} className="h-20 rounded-[var(--radius)]" />
        ))}
      </div>
    </main>
  );
}
