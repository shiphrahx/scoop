import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import FavouriteMealsList from "./FavouriteMealsList";
import { createClient } from "@/lib/supabase/server";
import type { FavouriteMeal } from "@/lib/types";

export default async function FavouriteMealsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("favourite_meals")
    .select("id, name, items, kcal, protein_g, carbs_g, fat_g")
    .order("created_at", { ascending: false });

  const meals = (data as FavouriteMeal[]) ?? [];

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
        <h1 className="text-3xl font-semibold">Favourite meals</h1>
      </div>

      {meals.length === 0 ? (
        <div className="sc-card flex flex-col items-center gap-3 p-8 text-center">
          <span
            className="grid h-12 w-12 place-items-center rounded-2xl"
            style={{ background: "var(--tint-teal)", color: "var(--ink-teal)" }}
          >
            <Star size={22} />
          </span>
          <p className="font-semibold">No favourite meals yet</p>
          <p className="text-sm text-[var(--muted)]">
            Building a meal you like? Tap{" "}
            <span className="font-medium">Save as favourite</span> on it in your
            day plan, then add it back here any time.
          </p>
        </div>
      ) : (
        <FavouriteMealsList meals={meals} />
      )}
    </main>
  );
}
