import Link from "next/link";
import { KeyRound, BookOpen, ChevronRight, CalendarCheck, Star } from "lucide-react";
import PlanMeal from "./PlanMeal";
import { createClient } from "@/lib/supabase/server";
import { hasApiKey } from "@/lib/queries";

export default async function PlanPage() {
  const supabase = await createClient();

  const [connected, { data: pantryRows }] = await Promise.all([
    hasApiKey(),
    supabase.from("pantry_items").select("name").order("name"),
  ]);
  const pantry = ((pantryRows as { name: string }[]) ?? []).map((r) => r.name);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <h1 className="text-3xl font-semibold">Plan a meal</h1>

      <Link
        href="/plan/day"
        className="flex items-center gap-3 rounded-[1.75rem] p-5 text-white transition active:scale-[0.99]"
        style={{ background: "var(--grad-primary)", boxShadow: "var(--shadow-glow)" }}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/20">
          <CalendarCheck size={22} />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">Plan my day</span>
          <span className="block truncate text-sm text-white/80">
            Line up every meal to hit today&apos;s macros
          </span>
        </span>
        <ChevronRight size={20} className="ml-auto shrink-0 text-white/80" />
      </Link>

      {connected ? (
        <PlanMeal pantry={pantry} />
      ) : (
        <Link
          href="/me"
          className="sc-card flex items-center gap-3 p-5 text-sm text-[var(--muted)] transition active:scale-[0.99]"
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
            style={{ background: "var(--tint-teal)", color: "var(--ink-teal)" }}
          >
            <KeyRound size={20} />
          </span>
          Connect your AI key in Settings to get meal ideas from your pantry.
        </Link>
      )}

      <Link
        href="/plan/favourites"
        className="sc-card flex items-center justify-between gap-3 px-5 py-4 font-semibold transition active:scale-[0.99]"
      >
        <span className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-2xl"
            style={{ background: "var(--tint-teal)", color: "var(--ink-teal)" }}
          >
            <Star size={20} />
          </span>
          Favourite meals
        </span>
        <ChevronRight size={20} className="text-[var(--muted)]" />
      </Link>

      <Link
        href="/plan/recipe"
        className="sc-card flex items-center justify-between gap-3 px-5 py-4 font-semibold transition active:scale-[0.99]"
      >
        <span className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-2xl"
            style={{ background: "var(--tint-teal)", color: "var(--ink-teal)" }}
          >
            <BookOpen size={20} />
          </span>
          Import a recipe
        </span>
        <ChevronRight size={20} className="text-[var(--muted)]" />
      </Link>
    </main>
  );
}
