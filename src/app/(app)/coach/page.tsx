import { getCoachData } from "@/lib/queries";
import { ApplyTargetsButton, AppleIngest, FitbitButton } from "./Controls";

// Turn the ?fitbit= result of the OAuth round-trip into a one-line banner.
const FITBIT_NOTES: Record<string, string> = {
  connected: "Fitbit connected 🎉 Tap sync to pull your data.",
  denied: "Fitbit connection was cancelled.",
  error: "Something went wrong connecting Fitbit. Try again.",
};

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ fitbit?: string }>;
}) {
  const [{ fitbit }, data] = await Promise.all([searchParams, getCoachData()]);
  const { review, current } = data;
  const note = fitbit ? FITBIT_NOTES[fitbit] : null;

  return (
    <main className="flex flex-1 flex-col gap-8 px-5 pt-8 pb-6">
      <h1 className="text-2xl font-extrabold">The Coach</h1>

      {note && (
        <p className="rounded-2xl bg-green-500/10 px-4 py-3 text-sm font-semibold text-green-700 dark:text-green-400">
          {note}
        </p>
      )}

      {/* Weekly review */}
      <section className="flex flex-col gap-4 rounded-3xl border border-black/10 p-5 dark:border-white/15">
        <h2 className="text-sm font-semibold text-black/50 dark:text-white/50">
          This week&apos;s review
        </h2>
        <p className="text-xl font-extrabold">{review.headline}</p>
        <p className="text-black/70 dark:text-white/70">{review.detail}</p>

        {current && (
          <div className="flex items-end justify-between rounded-2xl bg-black/5 p-4 dark:bg-white/10">
            <div>
              <p className="text-xs text-black/50 dark:text-white/50">Now</p>
              <p className="text-2xl font-extrabold tabular-nums">
                {current.kcal}
                <span className="text-sm font-semibold"> kcal</span>
              </p>
            </div>
            {review.changed && (
              <>
                <span className="pb-1 text-2xl">→</span>
                <div className="text-right">
                  <p className="text-xs text-black/50 dark:text-white/50">
                    Next week
                  </p>
                  <p className="text-2xl font-extrabold tabular-nums text-green-600 dark:text-green-400">
                    {review.macros.kcal}
                    <span className="text-sm font-semibold"> kcal</span>
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {current && <ApplyTargetsButton changed={review.changed} />}
      </section>

      {/* Recent activity */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-black/50 dark:text-white/50">
          Recent activity
        </h2>
        {data.activity.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/10 p-5 text-center text-sm text-black/50 dark:border-white/15 dark:text-white/50">
            No activity yet. Connect Fitbit or your Apple Watch below.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {data.activity.map((a) => (
              <li
                key={a.date}
                className="flex justify-between gap-2 text-sm text-black/60 dark:text-white/60"
              >
                <span>{a.date}</span>
                <span className="flex gap-3 tabular-nums">
                  {a.steps != null && <span>{a.steps.toLocaleString()} 👣</span>}
                  {a.workout_kcal != null && (
                    <span>{Math.round(a.workout_kcal)} kcal</span>
                  )}
                  {a.sleep_hours != null && <span>{a.sleep_hours}h 😴</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Connect data sources */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-black/50 dark:text-white/50">
          Fitbit
        </h2>
        <FitbitButton connected={data.fitbitConnected} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-black/50 dark:text-white/50">
          Apple Watch
        </h2>
        <AppleIngest initialToken={data.appleIngestToken} />
      </section>
    </main>
  );
}
