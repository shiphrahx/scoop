"use client";

// Lazy front door to the Recharts-backed charts.
//
// Recharts is a large dependency and every insights tab stays mounted at once
// (see Tabs.tsx), so importing the charts directly pulled the whole library
// into the progress route's initial JS, which on a phone delays hydration, and
// delayed hydration is exactly what stops nav links from prefetching (see the
// "hydration not completed" note in Next's linking docs).
//
// Each chart is wrapped in `next/dynamic` so Recharts loads in its own chunk,
// on the client, only once a chart is actually rendered. A skeleton holds the
// space until it arrives. `ssr: false` keeps the heavy lib off the server
// render too, these are interactive, hover-driven charts with no SSR value.
import dynamic from "next/dynamic";
import { SkeletonCard } from "@/components/Skeleton";

const loading = () => <SkeletonCard className="h-64" />;

export const WeightTrendChart = dynamic(
  () => import("./Charts").then((m) => m.WeightTrendChart),
  { ssr: false, loading },
);
export const TrendDotsChart = dynamic(
  () => import("./Charts").then((m) => m.TrendDotsChart),
  { ssr: false, loading },
);
export const WeightVsExercise = dynamic(
  () => import("./Charts").then((m) => m.WeightVsExercise),
  { ssr: false, loading },
);
export const DriverScatter = dynamic(
  () => import("./Charts").then((m) => m.DriverScatter),
  { ssr: false, loading },
);
export const MeasurementsChart = dynamic(
  () => import("./Charts").then((m) => m.MeasurementsChart),
  { ssr: false, loading },
);
export const CompareBars = dynamic(
  () => import("./Charts").then((m) => m.CompareBars),
  { ssr: false, loading },
);
export const WeeklyIntakeChart = dynamic(
  () => import("./Charts").then((m) => m.WeeklyIntakeChart),
  { ssr: false, loading },
);
export const SleepChart = dynamic(
  () => import("./Charts").then((m) => m.SleepChart),
  { ssr: false, loading },
);
