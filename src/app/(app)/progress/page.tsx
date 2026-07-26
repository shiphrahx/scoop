import { Suspense } from "react";
import Insights from "./Insights";
import InsightsSkeleton from "./InsightsSkeleton";

export default function ProgressPage() {
  return (
    // Wider than a phone column on a desktop or an iPad: the grids inside the
    // tabs are what use the space, and a 2xl column would waste it.
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 pt-6 pb-6 lg:max-w-5xl lg:px-8">
      {/* The title is static, so it paints instantly. Everything below depends
          on the ~dozen insight reads and streams in behind the skeleton. */}
      <h1 className="text-2xl font-semibold">Progress</h1>

      <Suspense fallback={<InsightsSkeleton />}>
        <Insights />
      </Suspense>
    </main>
  );
}
