import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import DayJump from "./DayJump";
import DayBody from "./DayBody";
import { getTimezone, localToday } from "@/lib/queries";
import { addDaysISO } from "@/lib/time";
import { SkeletonCard } from "@/components/Skeleton";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A friendly heading for the day being viewed: "Today", "Yesterday",
// "Tomorrow", or the weekday and date (e.g. "Wed 16 Jul") for anything further
// out. Weekday is drawn in the user's zone so it reads as their calendar.
function dayLabel(date: string, today: string, tz: string): string {
  if (date === today) return "Today";
  if (date === addDaysISO(today, -1)) return "Yesterday";
  if (date === addDaysISO(today, 1)) return "Tomorrow";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export default async function PlanDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const [{ date: dateParam }, tz] = await Promise.all([searchParams, getTimezone()]);
  const today = await localToday();
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : today;

  const prev = addDaysISO(date, -1);
  const next = addDaysISO(date, 1);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/plan"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted)]"
        >
          <ChevronLeft size={16} /> Plan
        </Link>
        <h1 className="text-3xl font-semibold">Plan my day</h1>
        <p className="text-sm text-[var(--muted)]">
          Pick what you fancy for each meal — we work out how much of each so
          the day hits your macros.
        </p>
      </div>

      {/* Step back to review past days or ahead to plan them. */}
      <nav className="flex items-center justify-between">
        <Link
          href={`/plan/day?date=${prev}`}
          className="grid h-11 w-11 place-items-center rounded-full bg-[var(--fill-soft)] transition active:scale-90"
          aria-label={`Go to ${prev}`}
        >
          <ChevronLeft size={20} />
        </Link>
        <DayJump date={date} today={today} label={dayLabel(date, today, tz)} />
        <Link
          href={`/plan/day?date=${next}`}
          className="grid h-11 w-11 place-items-center rounded-full bg-[var(--fill-soft)] transition active:scale-90"
          aria-label={`Go to ${next}`}
        >
          <ChevronRight size={20} />
        </Link>
      </nav>

      {/* The plan itself — high-day toggle, build button, drink logger, meal
          list — depends on the day's heavier reads, so it streams in under the
          header and day navigation, which are ready immediately. */}
      <Suspense
        key={date}
        fallback={
          <>
            <SkeletonCard className="h-14" />
            <SkeletonCard className="h-64" />
          </>
        }
      >
        <DayBody date={date} today={today} />
      </Suspense>
    </main>
  );
}
