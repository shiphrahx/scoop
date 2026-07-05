import Link from "next/link";
import MacroBar from "@/components/MacroBar";
import SignOutButton from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTargets, getTodayConsumed } from "@/lib/queries";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const name =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    "there";

  const [targets, consumed] = await Promise.all([
    getCurrentTargets(),
    getTodayConsumed(),
  ]);

  const kcalLeft = targets
    ? Math.max(0, Math.round(targets.kcal - consumed.kcal))
    : 0;

  return (
    <main className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-black/50 dark:text-white/50">Today</p>
          <h1 className="text-2xl font-extrabold">Hi, {name} 👋</h1>
        </div>
        <SignOutButton />
      </header>

      {targets ? (
        <>
          {/* Calories left */}
          <section className="rounded-3xl bg-gradient-to-br from-green-400 to-green-600 px-6 py-8 text-center text-white shadow-[0_12px_30px_-10px_rgba(34,197,94,0.7)]">
            <p className="text-sm font-extrabold uppercase tracking-wider opacity-90">
              Calories left
            </p>
            <p className="mt-1 text-7xl font-black tabular-nums">
              {kcalLeft}
            </p>
            <p className="mt-1 text-sm font-semibold opacity-90">
              of {Math.round(targets.kcal)} kcal · {Math.round(consumed.kcal)}{" "}
              eaten
            </p>
          </section>

          {/* Macros left */}
          <section className="sc-card flex flex-col gap-4 p-5">
            <MacroBar
              label="Protein"
              consumed={consumed.protein_g}
              target={targets.protein_g}
              color="bg-rose-500"
            />
            <MacroBar
              label="Carbs"
              consumed={consumed.carbs_g}
              target={targets.carbs_g}
              color="bg-amber-500"
            />
            <MacroBar
              label="Fat"
              consumed={consumed.fat_g}
              target={targets.fat_g}
              color="bg-sky-500"
            />
          </section>
        </>
      ) : (
        <section className="rounded-3xl border-2 border-dashed border-[var(--border)] p-8 text-center">
          <p className="text-sm text-[var(--muted)]">
            No target yet. Finish onboarding to see your macros.
          </p>
        </section>
      )}

      {/* The Coach */}
      <Link
        href="/coach"
        className="sc-card flex items-center gap-4 p-5 transition active:scale-[0.98]"
      >
        <span className="text-3xl">🧑‍🏫</span>
        <div>
          <p className="font-extrabold">The Coach</p>
          <p className="text-sm text-[var(--muted)]">
            Weekly review · connect Fitbit / Apple Watch
          </p>
        </div>
        <span className="ml-auto text-2xl text-[var(--muted)]">›</span>
      </Link>

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/add"
          className="sc-card flex flex-col items-center gap-1 py-5 font-extrabold transition active:scale-95"
        >
          <span className="text-3xl">🍽️</span>
          Log food
        </Link>
        <Link
          href="/progress"
          className="sc-card flex flex-col items-center gap-1 py-5 font-extrabold transition active:scale-95"
        >
          <span className="text-3xl">⚖️</span>
          Log weight
        </Link>
        <Link
          href="/batches"
          className="sc-card flex flex-col items-center gap-1 py-5 font-extrabold transition active:scale-95"
        >
          <span className="text-3xl">🍲</span>
          Batches
        </Link>
        <Link
          href="/pantry"
          className="sc-card flex flex-col items-center gap-1 py-5 font-extrabold transition active:scale-95"
        >
          <span className="text-3xl">🥫</span>
          Pantry
        </Link>
      </section>
    </main>
  );
}
