import WeightLogger from "./WeightLogger";
import MeasurementsForm from "./MeasurementsForm";
import { createClient } from "@/lib/supabase/server";

interface WeightRow {
  date: string;
  weight_kg: number;
}

interface MeasurementRow {
  chest_cm: number | null;
  waist_cm: number | null;
  arms_cm: number | null;
  thighs_cm: number | null;
  hips_cm: number | null;
}

export default async function ProgressPage() {
  const supabase = await createClient();

  const [{ data: weightData }, { data: measurementData }] = await Promise.all([
    supabase
      .from("weights")
      .select("date, weight_kg")
      .order("date", { ascending: false })
      .limit(7),
    supabase
      .from("measurements")
      .select("chest_cm, waist_cm, arms_cm, thighs_cm, hips_cm")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const weights = (weightData as WeightRow[]) ?? [];
  const last = weights[0] ? Number(weights[0].weight_kg) : null;
  const latestMeasurement: MeasurementRow = (measurementData as
    | MeasurementRow
    | null) ?? {
    chest_cm: null,
    waist_cm: null,
    arms_cm: null,
    thighs_cm: null,
    hips_cm: null,
  };

  return (
    <main className="flex flex-1 flex-col gap-8 px-5 pt-8 pb-6">
      <h1 className="text-2xl font-extrabold">Progress</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-[var(--muted)]">
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
                <span className="font-extrabold tabular-nums text-[var(--foreground)]">
                  {Number(w.weight_kg).toFixed(1)} kg
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-[var(--muted)]">
          Weekly measurements
        </h2>
        <MeasurementsForm
          initial={{
            chest_cm: latestMeasurement.chest_cm ?? undefined,
            waist_cm: latestMeasurement.waist_cm ?? undefined,
            arms_cm: latestMeasurement.arms_cm ?? undefined,
            thighs_cm: latestMeasurement.thighs_cm ?? undefined,
            hips_cm: latestMeasurement.hips_cm ?? undefined,
          }}
        />
      </section>
    </main>
  );
}
