import Link from "next/link";
import RecipeImport from "./RecipeImport";
import SavedRecipes from "./SavedRecipes";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTargets, getTodayConsumed, hasApiKey } from "@/lib/queries";
import type { Recipe } from "@/lib/types";

export default async function RecipePage() {
  const supabase = await createClient();

  const [{ data }, connected, targets, consumed] = await Promise.all([
    supabase
      .from("recipes")
      .select(
        "id, name, source_url, servings, ingredients, kcal, protein_g, carbs_g, fat_g",
      )
      .order("created_at", { ascending: false }),
    hasApiKey(),
    getCurrentTargets(),
    getTodayConsumed(),
  ]);

  const recipes = (data as Recipe[]) ?? [];
  const remainingKcal = targets
    ? Math.max(0, Math.round(targets.kcal - consumed.kcal))
    : 0;

  return (
    <main className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-6">
      <div className="flex items-center gap-3">
        <Link
          href="/plan"
          aria-label="Back"
          className="text-2xl text-[var(--muted)]"
        >
          ←
        </Link>
        <h1 className="text-3xl font-black">Recipes</h1>
      </div>

      {connected ? (
        <RecipeImport remainingKcal={remainingKcal} />
      ) : (
        <Link
          href="/me"
          className="rounded-3xl border-2 border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--muted)] active:scale-[0.99]"
        >
          🔑 Connect your Anthropic key in Me to import recipes.
        </Link>
      )}

      <SavedRecipes recipes={recipes} />
    </main>
  );
}
