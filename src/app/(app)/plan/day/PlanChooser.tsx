import Link from "next/link";
import { Sparkles, ChevronRight } from "lucide-react";

// The one way in to auto-planning: tap it and step through picking a carb, a
// protein and a fat (or let the app suggest each). Meals you already know go
// straight into the plan below — no wizard needed for those.
export default function PlanChooser() {
  return (
    <Link
      href="/plan/day/build"
      className="flex items-center gap-3 rounded-[1.75rem] p-5 text-left text-white transition active:scale-[0.99]"
      style={{ background: "var(--grad-primary)", boxShadow: "var(--shadow-glow)" }}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/20">
        <Sparkles size={22} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">Plan the day for me</span>
        <span className="block truncate text-sm text-white/80">
          Pick a carb, protein &amp; fat — or let us suggest each
        </span>
      </span>
      <ChevronRight size={20} className="ml-auto shrink-0 text-white/80" />
    </Link>
  );
}
