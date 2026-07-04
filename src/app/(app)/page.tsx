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
          <section className="rounded-3xl bg-green-500 px-6 py-8 text-center text-white shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
              Calories left
            </p>
            <p className="mt-1 text-6xl font-extrabold tabular-nums">
              {kcalLeft}
            </p>
            <p className="mt-1 text-sm opacity-80">
              of {Math.round(targets.kcal)} kcal · {Math.round(consumed.kcal)}{" "}
              eaten
            </p>
          </section>

          {/* Macros left */}
          <section className="flex flex-col gap-4 rounded-3xl border border-black/10 p-5 dark:border-white/15">
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
        <section className="rounded-3xl border border-dashed border-black/10 p-8 text-center dark:border-white/15">
          <p className="text-sm text-black/50 dark:text-white/50">
            No target yet. Finish onboarding to see your macros.
          </p>
        </section>
      )}

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/add"
          className="flex flex-col items-center gap-1 rounded-2xl bg-black/5 py-5 font-bold active:scale-95 dark:bg-white/10"
        >
          <span className="text-3xl">🍽️</span>
          Log food
        </Link>
        <Link
          href="/progress"
          className="flex flex-col items-center gap-1 rounded-2xl bg-black/5 py-5 font-bold active:scale-95 dark:bg-white/10"
        >
          <span className="text-3xl">⚖️</span>
          Log weight
        </Link>
      </section>
    </main>
  );
}
