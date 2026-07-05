import AddFoodForm from "./AddFoodForm";
import DeleteFoodButton from "./DeleteFoodButton";
import Favourites from "./Favourites";
import { createClient } from "@/lib/supabase/server";
import type { Favourite } from "@/lib/types";

interface FoodLogRow {
  id: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export default async function AddPage() {
  const supabase = await createClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [{ data: logData }, { data: favData }] = await Promise.all([
    supabase
      .from("food_logs")
      .select("id, name, kcal, protein_g, carbs_g, fat_g")
      .gte("logged_at", start.toISOString())
      .order("logged_at", { ascending: false }),
    supabase
      .from("favourites")
      .select("id, name, grams, kcal, protein_g, carbs_g, fat_g")
      .order("created_at", { ascending: false }),
  ]);

  const logs = (logData as FoodLogRow[]) ?? [];
  const favourites = (favData as Favourite[]) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <h1 className="text-3xl font-semibold">Log food</h1>

      <Favourites items={favourites} />

      <AddFoodForm />

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
                    {Math.round(log.kcal)} kcal · P{Math.round(log.protein_g)} C
                    {Math.round(log.carbs_g)} F{Math.round(log.fat_g)}
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
