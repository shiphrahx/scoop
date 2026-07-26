import { Suspense } from "react";
import Link from "next/link";
import { Settings, ChevronRight } from "lucide-react";
import CoachBody from "./CoachBody";
import { SkeletonCard } from "@/components/Skeleton";

export default function CoachPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 pt-8 pb-6 lg:px-8">
      <h1 className="text-3xl font-semibold">The Coach</h1>

      {/* The review and activity come from the weekly review — the slowest read
          in the app — so they stream in while the title and the link below are
          up straight away. */}
      <Suspense
        fallback={
          <>
            <SkeletonCard className="h-48" />
            <SkeletonCard className="h-40" />
          </>
        }
      >
        <CoachBody />
      </Suspense>

      <Link
        href="/me"
        className="sc-card flex items-center gap-3 p-4 font-semibold transition active:scale-[0.98]"
      >
        <span
          className="grid h-10 w-10 place-items-center rounded-2xl"
          style={{ background: "var(--tint-teal)", color: "var(--ink-teal)" }}
        >
          <Settings size={20} />
        </span>
        Devices &amp; goals
        <ChevronRight size={20} className="ml-auto text-[var(--muted)]" />
      </Link>
    </main>
  );
}
