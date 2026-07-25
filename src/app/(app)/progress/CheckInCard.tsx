import Link from "next/link";
import { CalendarCheck, ClipboardList, ChevronRight } from "lucide-react";

// The Progress-page entry point for the weekly check-in. Prompts when this
// week's check-in is still due; shows a done state (with an edit link) once it's
// been done. Replaces the old always-visible measurement inputs.
export default function CheckInCard({ done }: { done: boolean }) {
  if (done) {
    return (
      <Link
        href="/progress/check-in"
        className="sc-card flex items-center gap-3 p-4 active:scale-[0.99]"
      >
        <span className="sc-icon-dot bg-[var(--tint-green)] text-[var(--ink-green)]">
          <CalendarCheck size={16} />
        </span>
        <div className="flex flex-col">
          <span className="font-semibold">Checked in this week</span>
          <span className="text-sm text-[var(--muted)]">Tap to view or edit</span>
        </div>
        <ChevronRight size={18} className="ml-auto text-[var(--muted)]" />
      </Link>
    );
  }

  return (
    <Link
      href="/progress/check-in"
      className="sc-grad-panel flex items-center gap-3 p-5 active:scale-[0.99]"
    >
      <span className="sc-icon-tile">
        <ClipboardList size={20} />
      </span>
      <div className="flex flex-col">
        <span className="text-lg font-semibold">Check in for this week</span>
        <span className="text-sm opacity-90">
          Measurements, weight, and photos — takes a minute.
        </span>
      </div>
      <ChevronRight size={20} className="ml-auto" />
    </Link>
  );
}
