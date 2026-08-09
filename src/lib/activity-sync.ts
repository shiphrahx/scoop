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

// Minimal shape of the piece of a Supabase client we use here, works with both
// the user-scoped server client and the service-role admin client.
type ActivityWriter = {
  from: (table: string) => {
    upsert: (rows: ActivityRow[], opts: { onConflict: string }) => PromiseLike<unknown>;
  };
};

// What a sync actually managed to do, so the caller can tell "worked" apart from
// "ran and got nothing". getDay never throws, a 401, a revoked scope or a
// provider outage all come back as a day of nulls, so the count of days that
// carried real numbers is the only honest success signal we have.
export interface SyncResult {
  fetched: number; // days asked for
  written: number; // days that carried at least one real number
}

// True when the provider gave us nothing at all for a day. Writing such a day
// would replace whatever is already stored (an Apple push, an earlier good pull)
// with nulls, so these are dropped rather than upserted.
const hasData = (d: { steps: number | null; workout_kcal: number | null; sleep_hours: number | null }) =>
  d.steps != null || d.workout_kcal != null || d.sleep_hours != null;

// Fetch the last `days` days of steps / active calories / sleep and upsert them
// for the user. Each day is fetched in parallel; the whole set is written in one
// upsert keyed on (user_id, date) so re-syncing a day overwrites rather than
// duplicates.
//
// Empty days are skipped, not written. A failed provider call is indistinguishable
// from a genuinely empty day at this layer, and blanking a row we already hold is
// the worse of the two outcomes.
export async function syncActivityDays(
  client: ActivityWriter,
  userId: string,
  accessToken: string,
  days = 7,
): Promise<SyncResult> {
  const now = Date.now();
  const fetched = await Promise.all(
    Array.from({ length: days }, (_, i) =>
      getDay(accessToken, isoDay(new Date(now - i * DAY_MS))),
    ),
  );
  const rows: ActivityRow[] = fetched.filter(hasData).map((d) => ({
    user_id: userId,
    date: d.date,
    steps: d.steps,
    workout_kcal: d.workout_kcal,
    sleep_hours: d.sleep_hours,
    source: "fitbit",
    updated_at: new Date().toISOString(),
  }));
  if (rows.length > 0) {
    await client.from("activity").upsert(rows, { onConflict: "user_id,date" });
  }
  return { fetched: days, written: rows.length };
}
