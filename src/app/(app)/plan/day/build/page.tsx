import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import BuildWizard from "./BuildWizard";
import { getProfile, getTodayPlan, hasApiKey } from "@/lib/queries";
import { DEFAULT_MEAL_SLOTS } from "@/lib/types";
import { pantryCarbs, pantryProteins } from "@/lib/foodgroups";
import { violatesDiet } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";

// The "I know what I want to eat" guided flow: tell us the meals you already
// know, then build the rest around a base carb + protein from your pantry.
export default async function PlanDayBuildPage() {
  const supabase = await createClient();
  const [profile, plan, connected, { data: pantryRows }] = await Promise.all([
    getProfile(),
    getTodayPlan(),
    hasApiKey(),
    supabase.from("pantry_items").select("name").order("name"),
  ]);

  const slots =
    profile?.meal_slots?.length ? profile.meal_slots : DEFAULT_MEAL_SLOTS;
  const filled = plan.map((m) => m.slot);

  const diet = profile?.diet_type ?? "regular";
  const names = ((pantryRows as { name: string }[]) ?? []).map((r) => r.name);
  // Offer only pantry items the diet allows (a vegan pantry shouldn't surface
  // meat as a protein option; a celiac shouldn't be offered ordinary pasta).
  const allowed = names.filter((n) => !violatesDiet(n, diet));
  const carbs = pantryCarbs(allowed);
  const proteins = pantryProteins(allowed);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/plan/day"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted)]"
        >
          <ChevronLeft size={16} /> Plan my day
        </Link>
        <h1 className="text-3xl font-semibold">What do you want to eat?</h1>
      </div>

      <BuildWizard
        slots={slots}
        filled={filled}
        carbs={carbs}
        proteins={proteins}
        connected={connected}
      />
    </main>
  );
}
