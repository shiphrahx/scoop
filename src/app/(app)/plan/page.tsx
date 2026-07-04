import Link from "next/link";
import PlanMeal from "./PlanMeal";
import { createClient } from "@/lib/supabase/server";
import { hasApiKey } from "@/lib/queries";

export default async function PlanPage() {
  const supabase = await createClient();

  const [connected, { count }] = await Promise.all([
    hasApiKey(),
    supabase
      .from("pantry_items")
      .select("id", { count: "exact", head: true }),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-6">
      <h1 className="text-2xl font-extrabold">Plan a meal</h1>

      {connected ? (
        <PlanMeal hasPantry={(count ?? 0) > 0} />
      ) : (
        <Link
          href="/me"
          className="rounded-3xl border border-dashed border-black/15 p-5 text-center text-sm text-black/50 active:scale-[0.99] dark:border-white/20 dark:text-white/50"
        >
          🔑 Connect your Anthropic key in Me to get meal ideas from your pantry.
        </Link>
      )}

      <Link
        href="/plan/recipe"
        className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 px-5 py-4 font-bold active:scale-[0.99] dark:border-white/15"
      >
        <span className="flex items-center gap-3">
          <span className="text-2xl">📖</span> Import a recipe
        </span>
        <span className="text-black/30 dark:text-white/30">→</span>
      </Link>
    </main>
  );
}
