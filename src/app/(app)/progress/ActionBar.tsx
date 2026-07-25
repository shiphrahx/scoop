"use client";

// The two things you can *do* on this page, on one row at the top.
//
// Both used to be tall cards — a full stepper panel and a gradient banner —
// which is a screen of vertical space spent on two taps. The stepper now lives
// in a sheet behind the first button, so the dashboard starts at the top of the
// page.

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, Check, ClipboardList, Scale } from "lucide-react";
import WeightLogger from "./WeightLogger";
import { Drawer } from "./insights/ui";

export default function ActionBar({
  last,
  loggedToday,
  checkedIn,
}: {
  last: number | null;
  loggedToday: boolean;
  checkedIn: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`sc-btn py-3 ${loggedToday ? "sc-btn-neutral" : "sc-btn-primary"}`}
      >
        {loggedToday ? <Check size={18} /> : <Scale size={18} />}
        {loggedToday ? "Weighed in" : "Log weight"}
      </button>

      <Link
        href="/progress/check-in"
        className={`sc-btn py-3 ${checkedIn ? "sc-btn-neutral" : "sc-btn-soft"}`}
      >
        {checkedIn ? <CalendarCheck size={18} /> : <ClipboardList size={18} />}
        {checkedIn ? "Checked in" : "Check in"}
      </Link>

      <Drawer open={open} onClose={() => setOpen(false)} title="Log your weight">
        <WeightLogger last={last} onSaved={() => setOpen(false)} />
      </Drawer>
    </div>
  );
}
