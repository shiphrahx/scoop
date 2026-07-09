import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import DayPlan from "./DayPlan";
import {
  getProfile,
  getCurrentTargets,
  getTodayPlan,
  hasApiKey,
} from "@/lib/queries";
import { DEFAULT_MEAL_SLOTS } from "@/lib/types";

export default async function PlanDayPage() {
  const [profile, target, plan, connected] = await Promise.all([
    getProfile(),
    getCurrentTargets(),
    getTodayPlan(),
    hasApiKey(),
  ]);

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
          Add the meals you already know. Leave the rest — I&apos;ll fill them
          from your pantry to hit today&apos;s macros.
        </p>
      </div>

      <DayPlan slots={slots} target={target} connected={connected} />
    </main>
  );
}
