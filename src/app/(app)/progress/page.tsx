import WeightLogger from "./WeightLogger";
import CheckInCard from "./CheckInCard";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCheckIn } from "@/lib/queries";

interface WeightRow {
  date: string;
  weight_kg: number;
}

export default async function ProgressPage() {
  const supabase = await createClient();

  const [{ data: weightData }, currentCheckIn] = await Promise.all([
    supabase
      .from("weights")
      .select("date, weight_kg")
      .order("date", { ascending: false })
      .limit(7),
    getCurrentCheckIn(),
  ]);

  const weights = (weightData as WeightRow[]) ?? [];
  const last = weights[0] ? Number(weights[0].weight_kg) : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 pt-8 pb-6 lg:px-8">
      <h1 className="text-3xl font-semibold">Progress</h1>

      <CheckInCard done={Boolean(currentCheckIn)} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Daily weight
        </h2>
        <WeightLogger last={last} />
        {weights.length > 0 && (
          <ul className="sc-card flex flex-col divide-y divide-[var(--border)] p-2">
            {weights.map((w) => (
              <li
                key={w.date}
                className="flex justify-between px-3 py-2 text-sm text-[var(--muted)]"
              >
                <span>{w.date}</span>
                <span className="font-semibold tabular-nums text-[var(--foreground)]">
                  {Number(w.weight_kg).toFixed(1)} kg
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
