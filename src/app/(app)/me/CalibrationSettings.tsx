"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { restartCalibration } from "./actions";
import { CALIBRATION_MAX_DAYS, CALIBRATION_MIN_DAYS } from "@/lib/coach";

// Restarting the maintenance-first calibration hold.
//
// Calibration is how the app learns what this user actually burns, and that
// knowledge goes stale — someone who stopped logging for months comes back a
// different weight with a target computed for the old one. Re-onboarding would
// wipe their history, so this reopens the window instead: eat at maintenance
// for a fortnight while the app re-measures, then the deficit reopens modestly.
//
// It moves the plan off a deficit for two weeks, so it takes a second tap to
// confirm rather than firing on the first.
export default function CalibrationSettings({
  calibrating,
  daysElapsed,
}: {
  // Whether a hold is running right now (the in-force target is a calibration one).
  calibrating: boolean;
  // Whole days since the current hold opened. Null when none has ever run.
  daysElapsed: number | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function restart() {
    setError(null);
    startTransition(async () => {
      try {
        await restartCalibration();
        setConfirming(false);
        setDone(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't work. Try again.");
      }
    });
  }

  return (
    <section className="flex w-full flex-col gap-4 sc-card p-5 text-left">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Calibration</h2>
        <p className="text-sm text-[var(--muted)]">
          Calibration is {CALIBRATION_MIN_DAYS}–{CALIBRATION_MAX_DAYS} days of
          eating at maintenance while the app measures what you actually burn,
          before any deficit starts. Restart it if you&apos;ve been away and your
          numbers no longer describe you — your history and everything you&apos;ve
          logged stays.
        </p>
      </div>

      <div className="rounded-2xl bg-[var(--fill-soft)] p-4 text-sm">
        {calibrating ? (
          <p>
            <span className="font-semibold">Calibrating now</span>
            {daysElapsed != null && (
              <>
                {" · "}day {daysElapsed + 1} of up to {CALIBRATION_MAX_DAYS}
              </>
            )}
            . Your target is held at maintenance until it finishes.
          </p>
        ) : (
          <p>
            <span className="font-semibold">Not calibrating.</span> You&apos;re on
            your normal plan.
          </p>
        )}
      </div>

      {done && (
        <p className="text-sm font-semibold" style={{ color: "var(--ink-teal)" }}>
          Calibration restarted. Your target is at maintenance for the next couple
          of weeks — keep logging and weighing in so the measurement is a good one.
        </p>
      )}

      {error && (
        <p className="text-sm text-rose-500">{error}</p>
      )}

      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-[var(--muted)]">
            This moves you off your deficit and back to maintenance for up to{" "}
            {CALIBRATION_MAX_DAYS} days, starting today. Refeed days pause until
            it finishes.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="sc-btn sc-btn-soft flex-1 py-3"
            >
              Cancel
            </button>
            <button
              onClick={restart}
              disabled={pending}
              className="sc-btn sc-btn-primary flex-1 py-3"
            >
              {pending ? "Restarting…" : "Yes, restart"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setDone(false);
            setError(null);
            setConfirming(true);
          }}
          className="sc-btn sc-btn-soft w-full py-3"
        >
          <RotateCcw size={18} />
          {calibrating ? "Start calibration over" : "Restart calibration"}
        </button>
      )}
    </section>
  );
}
