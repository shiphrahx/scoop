import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import BuildWizard from "./BuildWizard";
import { getProfile } from "@/lib/queries";
import { pantryCarbs, pantryProteins, pantryFats } from "@/lib/foodgroups";
import { isFoodAllowed } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";

// "Plan the day for me" workflow: one tap at a time, choose a base carb, a
// protein and a fat from your pantry — or let the app suggest each — then it
// portions the whole day from just those foods to hit today's macros.
export default async function PlanDayBuildPage() {
  const supabase = await createClient();
  const [profile, { data: pantryRows }] = await Promise.all([
    getProfile(),
    supabase.from("pantry_items").select("name").order("name"),
  ]);

  const diet = profile?.diet_type ?? "regular";
  const allergies = profile?.allergies ?? [];
  const dislikes = profile?.dislikes ?? [];
  const names = ((pantryRows as { name: string }[]) ?? []).map((r) => r.name);
  // Only offer pantry items the user can actually eat — diet, allergies and
  // dislikes all excluded, so nothing they'd reject is ever suggested.
  const allowed = names.filter((n) => isFoodAllowed(n, diet, allergies, dislikes));
  const carbs = pantryCarbs(allowed);
  const proteins = pantryProteins(allowed);
  const fats = pantryFats(allowed);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/plan/day"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted)]"
        >
          <ChevronLeft size={16} /> Plan my day
        </Link>
        <h1 className="text-3xl font-semibold">Plan the day for me</h1>
        <p className="text-sm text-[var(--muted)]">
          Pick a carb, a protein and a fat from your pantry — or let us suggest
          each. We&apos;ll portion the whole day from just those.
        </p>
      </div>

      <BuildWizard carbs={carbs} proteins={proteins} fats={fats} />
    </main>
  );
}
