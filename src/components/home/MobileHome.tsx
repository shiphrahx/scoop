import Link from "next/link";
import { UtensilsCrossed, Scale, CookingPot, Package, Sparkles, ChevronRight } from "lucide-react";
import ProgressRing from "@/components/ProgressRing";
import MacroBar from "@/components/MacroBar";
import SignOutButton from "@/components/SignOutButton";
import type { DailyTargets, Macros } from "@/lib/types";

const quickActions = [
  { href: "/add", label: "Log food", icon: UtensilsCrossed },
  { href: "/progress", label: "Log weight", icon: Scale },
  { href: "/batches", label: "Batches", icon: CookingPot },
  { href: "/pantry", label: "Pantry", icon: Package },
];

export default function MobileHome({
  name,
  targets,
  consumed,
  coach,
}: {
  name: string;
  targets: DailyTargets | null;
  consumed: Macros;
  coach: { headline: string; detail: string };
}) {
  const kcalLeft = targets ? Math.max(0, Math.round(targets.kcal - consumed.kcal)) : 0;

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-8 pb-6 lg:hidden">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--muted)]">Today</p>
          <h1 className="text-2xl font-semibold">Hi, {name}</h1>
        </div>
        <SignOutButton />
      </header>

      {targets ? (
        <>
          {/* Hero: the signature calorie ring. */}
          <section className="sc-card flex flex-col items-center gap-2 px-6 py-8">
            <ProgressRing value={consumed.kcal} max={targets.kcal} size={230} stroke={20}>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                  Calories left
                </p>
                <p className="text-6xl font-bold tabular-nums leading-tight">
                  {kcalLeft}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  of {Math.round(targets.kcal)} kcal
                </p>
              </div>
            </ProgressRing>
            <p className="text-sm text-[var(--muted)]">
              {Math.round(consumed.kcal)} eaten today
            </p>
          </section>

          {/* Macros left */}
          <section className="sc-card flex flex-col gap-4 p-5">
            <MacroBar
              label="Protein"
              consumed={consumed.protein_g}
              target={targets.protein_g}
              gradient="linear-gradient(90deg, var(--g-green), var(--g-teal))"
            />
            <MacroBar
              label="Carbs"
              consumed={consumed.carbs_g}
              target={targets.carbs_g}
              gradient="linear-gradient(90deg, var(--g-teal), var(--g-blue))"
            />
            <MacroBar
              label="Fat"
              consumed={consumed.fat_g}
              target={targets.fat_g}
              gradient="linear-gradient(90deg, var(--g-blue), var(--accent))"
            />
          </section>
        </>
      ) : (
        <section className="sc-card grid place-items-center gap-2 p-8 text-center">
          <p className="text-sm text-[var(--muted)]">
            No target yet. Finish onboarding to see your macros.
          </p>
          <Link href="/onboarding" className="sc-btn sc-btn-primary mt-2">
            Finish setup
          </Link>
        </section>
      )}

      {/* The Coach insight */}
      <Link href="/coach" className="sc-card flex items-center gap-4 p-5 transition active:scale-[0.99]">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white"
          style={{ background: "var(--grad-cool)" }}
        >
          <Sparkles size={22} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{coach.headline}</p>
          <p className="truncate text-sm text-[var(--muted)]">{coach.detail}</p>
        </div>
        <ChevronRight size={22} className="ml-auto shrink-0 text-[var(--muted)]" />
      </Link>

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-3">
        {quickActions.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="sc-card flex flex-col items-center gap-2 py-6 font-medium transition active:scale-95"
          >
            <span
              className="grid h-11 w-11 place-items-center rounded-2xl"
              style={{ background: "rgba(20,184,166,0.12)", color: "#0f766e" }}
            >
              <Icon size={22} />
            </span>
            {label}
          </Link>
        ))}
      </section>
    </main>
  );
}
