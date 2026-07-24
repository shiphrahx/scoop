// Pull recent days from the wearables provider and store them in `activity`.
// Shared by the connect callback (so data shows the moment a device is linked,
// not only after the nightly cron) and by the cron itself. Provider-agnostic:
// getDay dispatches to whichever provider is live (see lib/fitbit.ts).

import { getDay } from "@/lib/fitbit";

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

interface ActivityRow {
  user_id: string;
  date: string;
  steps: number | null;
  workout_kcal: number | null;
  sleep_hours: number | null;
  source: string;
  updated_at: string;
}

// Minimal shape of the piece of a Supabase client we use here — works with both
// the user-scoped server client and the service-role admin client.
type ActivityWriter = {
  from: (table: string) => {
    upsert: (rows: ActivityRow[], opts: { onConflict: string }) => PromiseLike<unknown>;
  };
};

// Fetch the last `days` days of steps / active calories / sleep and upsert them
// for the user. Each day is fetched in parallel; the whole set is written in one
// upsert keyed on (user_id, date) so re-syncing a day overwrites rather than
// duplicates.
export async function syncActivityDays(
  client: ActivityWriter,
  userId: string,
  accessToken: string,
  days = 7,
): Promise<void> {
  const now = Date.now();
  const fetched = await Promise.all(
    Array.from({ length: days }, (_, i) =>
      getDay(accessToken, isoDay(new Date(now - i * DAY_MS))),
    ),
  );
  const rows: ActivityRow[] = fetched.map((d) => ({
    user_id: userId,
    date: d.date,
    steps: d.steps,
    workout_kcal: d.workout_kcal,
    sleep_hours: d.sleep_hours,
    source: "fitbit",
    updated_at: new Date().toISOString(),
  }));
  await client.from("activity").upsert(rows, { onConflict: "user_id,date" });
}
