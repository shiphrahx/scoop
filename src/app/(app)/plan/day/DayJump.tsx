"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

// The day heading in the nav, tappable to jump straight to any date. Tapping it
// opens the browser's native date picker (seeded to the day being viewed); a
// pick navigates to that day. A hidden date input drives it so we get the OS
// picker for free — no calendar to build or style.
export default function DayJump({
  date,
  today,
  label,
}: {
  date: string;
  today: string;
  label: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function open() {
    const el = inputRef.current;
    if (!el) return;
    // showPicker is the reliable way to open it on tap; fall back to focus.
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  }

  function jump(value: string) {
    if (!value) return;
    router.push(value === today ? "/plan/day" : `/plan/day?date=${value}`);
  }

  return (
    <div className="relative flex flex-col items-center">
      <button
        onClick={open}
        className="inline-flex items-center gap-1 text-lg font-semibold transition active:scale-95"
        aria-label="Choose a day"
      >
        {label}
        <ChevronDown size={16} className="text-[var(--muted)]" />
      </button>
      {date !== today && (
        <button
          onClick={() => router.push("/plan/day")}
          className="text-xs text-[var(--muted)] underline"
        >
          Back to today
        </button>
      )}
      {/* Hidden picker driver: no layout footprint, opened via showPicker(). */}
      <input
        ref={inputRef}
        type="date"
        value={date}
        onChange={(e) => jump(e.target.value)}
        className="pointer-events-none absolute inset-0 h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
