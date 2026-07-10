import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import RecipeImport from "./RecipeImport";
import SavedRecipes from "./SavedRecipes";
import { createClient } from "@/lib/supabase/server";
import { hasApiKey } from "@/lib/queries";
import type { Recipe } from "@/lib/types";

export default async function RecipePage() {
  const supabase = await createClient();

  const [{ data }, connected] = await Promise.all([
    supabase
      .from("recipes")
      .select(
        "id, name, source_url, servings, ingredients, kcal, protein_g, carbs_g, fat_g",
      )
      .order("created_at", { ascending: false }),
    hasApiKey(),
  ]);

  const recipes = (data as Recipe[]) ?? [];

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

      <RecipeImport connected={connected} />

      <SavedRecipes recipes={recipes} />
    </main>
  );
}
