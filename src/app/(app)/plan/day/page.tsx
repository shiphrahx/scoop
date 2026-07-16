import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import DayPlan from "./DayPlan";
import DayJump from "./DayJump";
import PlanChooser from "./PlanChooser";
import {
  getProfile,
  getCurrentTargets,
  getPlanForDate,
  getTimezone,
  localToday,
} from "@/lib/queries";
import { addDaysISO } from "@/lib/time";
import { DEFAULT_MEAL_SLOTS } from "@/lib/types";
import { normalizePrefs } from "@/lib/nutrients";

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

  const [profile, target, plan] = await Promise.all([
    getProfile(),
    getCurrentTargets(),
    getPlanForDate(date),
  ]);

  const prev = addDaysISO(date, -1);
  const next = addDaysISO(date, 1);

  const prefs = normalizePrefs(profile?.nutrient_prefs);
  const slotNames =
    profile?.meal_slots?.length ? profile.meal_slots : DEFAULT_MEAL_SLOTS;
  const bySlot = new Map(plan.map((m) => [m.slot, m]));
  const slots = slotNames.map((slot) => ({
    slot,
    meal: bySlot.get(slot) ?? null,
  }));

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
          Let the app plan it, or add the meals you already know below and it
          builds the rest around them.
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

      <PlanChooser date={date === today ? undefined : date} />

      <DayPlan slots={slots} target={target} prefs={prefs} date={date} />
    </main>
  );
}
