import AddFoodForm from "./AddFoodForm";
import DeleteFoodButton from "./DeleteFoodButton";
import { createClient } from "@/lib/supabase/server";

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

  const { data } = await supabase
    .from("food_logs")
    .select("id, name, kcal, protein_g, carbs_g, fat_g")
    .gte("logged_at", start.toISOString())
    .order("logged_at", { ascending: false });

  const logs = (data as FoodLogRow[]) ?? [];

  return (
    <main className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-6">
      <h1 className="text-2xl font-extrabold">Log food</h1>

      <AddFoodForm />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-black/50 dark:text-white/50">
          Today
        </h2>
        {logs.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-white/40">
            Nothing logged yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{log.name}</p>
                  <p className="text-xs text-black/50 dark:text-white/50">
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
