import type { ReactNode } from "react";
import DesktopDashboardMount from "@/components/home/DesktopDashboardMount";
import {
  getWeightHistory,
  getActivityHistory,
  getLatestWeight,
} from "@/lib/queries";
import type { Macros } from "@/lib/types";
import type { NutrientKey } from "@/lib/nutrients";

// The desktop home, with its own data fetched here rather than on the page.
//
// The weight-history and activity series (and latest weight) feed only the
// desktop charts — a phone never shows them. Fetching them on the page put three
// queries the phone can't use in front of the calorie ring. Moving them here,
// behind the page's Suspense boundary, means the mobile ring waits only on its
// own light reads, and the desktop data streams in independently.
export default async function DesktopHome({
  name,
  targets,
  consumed,
  planned,
  coach,
  planPrompt,
  prefs,
  calibration,
}: {
  name: string;
  targets: Macros | null;
  consumed: Macros;
  planned: Macros;
  coach: ReactNode;
  planPrompt: { hasPlan: boolean } | null;
  prefs: NutrientKey[];
  calibration: ReactNode;
}) {
  const [weightHistory, activity, latestWeight] = await Promise.all([
    getWeightHistory(30),
    getActivityHistory(14),
    getLatestWeight(),
  ]);

  return (
    <DesktopDashboardMount
      name={name}
      targets={targets}
      consumed={consumed}
      planned={planned}
      coach={coach}
      weightHistory={weightHistory}
      activity={activity}
      latestWeight={latestWeight}
      planPrompt={planPrompt}
      prefs={prefs}
      calibration={calibration}
    />
  );
}
