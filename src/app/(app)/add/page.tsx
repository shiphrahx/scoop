import AddFoodForm from "./AddFoodForm";
import DeleteFoodButton from "./DeleteFoodButton";
import Favourites from "./Favourites";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries";
import { NUTRIENTS, normalizePrefs, valueOf, formatNutrient } from "@/lib/nutrients";
import type { Favourite, Macros } from "@/lib/types";

interface FoodLogRow extends Macros {
  id: string;
  name: string;
}

export default async function AddPage() {
  const supabase = await createClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [{ data: logData }, { data: favData }, profile] = await Promise.all([
    supabase
      .from("food_logs")
      .select(
        "id, name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg",
      )
      .gte("logged_at", start.toISOString())
      .order("logged_at", { ascending: false }),
    supabase
      .from("favourites")
      .select("id, name, grams, kcal, protein_g, carbs_g, fat_g")
      .order("created_at", { ascending: false }),
    getProfile(),
  ]);

  const logs = (logData as FoodLogRow[]) ?? [];
  const favourites = (favData as Favourite[]) ?? [];
  const prefs = normalizePrefs(profile?.nutrient_prefs);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <h1 className="text-3xl font-semibold">Log food</h1>

      <Favourites items={favourites} />

      <AddFoodForm prefs={prefs} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Today
        </h2>
        {logs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nothing logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logs.map((log) => (
              <li
                key={log.id}
                className="sc-card flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{log.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {[
                      `${Math.round(log.kcal)} kcal`,
                      ...prefs.map(
                        (k) =>
                          `${NUTRIENTS[k].label} ${formatNutrient(valueOf(log, k), k)}`,
                      ),
                    ].join(" · ")}
                  </p>
                </div>
                <DeleteFoodButton id={log.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
