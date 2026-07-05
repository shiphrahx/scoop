import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Link
          href="/plan"
          aria-label="Back"
          className="text-[var(--muted)] transition active:scale-90"
        >
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-3xl font-semibold">Recipes</h1>
      </div>

      {connected ? (
        <RecipeImport remainingKcal={remainingKcal} />
      ) : (
        <Link
          href="/me"
          className="sc-card flex items-center gap-3 p-5 text-sm text-[var(--muted)] transition active:scale-[0.99]"
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
            style={{ background: "rgba(20,184,166,0.12)", color: "#0f766e" }}
          >
            <KeyRound size={20} />
          </span>
          Connect your AI key in Settings to import recipes from a link or a
          screenshot.
        </Link>
      )}

      <SavedRecipes recipes={recipes} />
    </main>
  );
}
