import Link from "next/link";
import { ArrowRight, Footprints, Moon, Flame, Settings, ChevronRight } from "lucide-react";
import { getCoachData } from "@/lib/queries";
import { ApplyTargetsButton } from "./Controls";

export default async function CoachPage() {
  const data = await getCoachData();
  const { review, current } = data;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 pt-8 pb-6 lg:px-8">
      <h1 className="text-3xl font-semibold">The Coach</h1>

      {/* Weekly review */}
      <section className="sc-card flex flex-col gap-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          This week&apos;s review
        </h2>
        <p className="text-2xl font-semibold">{review.headline}</p>
        <p className="text-[var(--muted)]">{review.detail}</p>

        {current && (
          <div className="flex items-end justify-between rounded-2xl bg-[rgba(15,23,42,0.04)] p-4">
            <div>
              <p className="text-xs text-[var(--muted)]">Now</p>
              <p className="text-2xl font-bold tabular-nums">
                {current.kcal}
                <span className="text-sm font-medium"> kcal</span>
              </p>
            </div>
            {review.changed && (
              <>
                <ArrowRight size={22} className="mb-1 text-[var(--muted)]" />
                <div className="text-right">
                  <p className="text-xs text-[var(--muted)]">Next week</p>
                  <p
                    className="text-2xl font-bold tabular-nums"
                    style={{ color: "#15803d" }}
                  >
                    {review.macros.kcal}
                    <span className="text-sm font-medium"> kcal</span>
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Recent activity
        </h2>
        {data.activity.length === 0 ? (
          <Link
            href="/me"
            className="sc-card block p-5 text-center text-sm text-[var(--muted)] transition active:scale-[0.99]"
          >
            No activity yet. Connect Fitbit or your Apple Watch in Settings.
          </Link>
        ) : (
          <ul className="sc-card flex flex-col divide-y divide-[var(--border)] p-2">
            {data.activity.map((a) => (
              <li
                key={a.date}
                className="flex justify-between gap-2 px-3 py-2.5 text-sm text-[var(--muted)]"
              >
                <span>{a.date}</span>
                <span className="flex items-center gap-4 tabular-nums">
                  {a.steps != null && (
                    <span className="inline-flex items-center gap-1">
                      <Footprints size={15} /> {a.steps.toLocaleString()}
                    </span>
                  )}
                  {a.workout_kcal != null && (
                    <span className="inline-flex items-center gap-1">
                      <Flame size={15} /> {Math.round(a.workout_kcal)}
                    </span>
                  )}
                  {a.sleep_hours != null && (
                    <span className="inline-flex items-center gap-1">
                      <Moon size={15} /> {a.sleep_hours}h
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/me"
        className="sc-card flex items-center gap-3 p-4 font-semibold transition active:scale-[0.98]"
      >
        <span
          className="grid h-10 w-10 place-items-center rounded-2xl"
          style={{ background: "rgba(20,184,166,0.12)", color: "#0f766e" }}
        >
          <Settings size={20} />
        </span>
        Devices &amp; goals
        <ChevronRight size={20} className="ml-auto text-[var(--muted)]" />
      </Link>
    </main>
  );
}
