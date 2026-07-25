import WeightLogger from "./WeightLogger";
import WeightHistory from "./WeightHistory";
import CheckInCard from "./CheckInCard";
import Dashboard from "./Dashboard";
import {
  getActivityHistory,
  getCurrentCheckIn,
  getDeviceConnected,
  getMeasurementHistory,
  getWeightHistory,
} from "@/lib/queries";

export default async function ProgressPage() {
  const [
    currentCheckIn,
    weightHistory,
    measurementHistory,
    activity,
    deviceConnected,
  ] = await Promise.all([
    getCurrentCheckIn(),
    getWeightHistory(365),
    getMeasurementHistory(365),
    getActivityHistory(90),
    getDeviceConnected(),
  ]);

  // Newest weigh-in is the last point (history is oldest→newest); it prefills
  // the one-tap logger.
  const last =
    weightHistory.length > 0
      ? weightHistory[weightHistory.length - 1].weight_kg
      : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 pt-8 pb-6 lg:px-8">
      <h1 className="text-3xl font-semibold">Progress</h1>

      <CheckInCard done={Boolean(currentCheckIn)} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Daily weight
        </h2>
        <WeightLogger last={last} />
      </section>

      <Dashboard
        weights={weightHistory}
        measurements={measurementHistory}
        activity={activity}
        deviceConnected={deviceConnected}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          All weigh-ins
        </h2>
        <WeightHistory weights={weightHistory} />
      </section>
    </main>
  );
}
