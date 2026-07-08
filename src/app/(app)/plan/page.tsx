import Link from "next/link";
import { KeyRound, BookOpen, ChevronRight } from "lucide-react";
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

      {connected ? (
        <PlanMeal pantry={pantry} />
      ) : (
        <Link
          href="/me"
          className="sc-card flex items-center gap-3 p-5 text-sm text-[var(--muted)] transition active:scale-[0.99]"
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
            style={{ background: "rgba(20,184,166,0.12)", color: "#0f766e" }}
          >
            <KeyRound size={20} />
          </span>
          Connect your AI key in Settings to get meal ideas from your pantry.
        </Link>
      )}

      <Link
        href="/plan/recipe"
        className="sc-card flex items-center justify-between gap-3 px-5 py-4 font-semibold transition active:scale-[0.99]"
      >
        <span className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-2xl"
            style={{ background: "rgba(20,184,166,0.12)", color: "#0f766e" }}
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
