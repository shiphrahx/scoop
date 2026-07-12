import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import DayPlan from "./DayPlan";
import PlanChooser from "./PlanChooser";
import {
  getProfile,
  getCurrentTargets,
  getTodayPlan,
} from "@/lib/queries";
import { DEFAULT_MEAL_SLOTS } from "@/lib/types";
import { normalizePrefs } from "@/lib/nutrients";

export default async function PlanDayPage() {
  const [profile, target, plan] = await Promise.all([
    getProfile(),
    getCurrentTargets(),
    getTodayPlan(),
  ]);

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
          Let the app plan it all, or tell it what you fancy and build the rest
          from your pantry.
        </p>
      </div>

      <PlanChooser />

      <DayPlan slots={slots} target={target} prefs={prefs} />
    </main>
  );
}
