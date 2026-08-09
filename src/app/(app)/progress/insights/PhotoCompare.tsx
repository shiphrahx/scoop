"use client";

// Start against latest, one photo sliding over the other.
//
// A side-by-side pair makes the eye hunt for differences; an overlay with a
// wipe puts the two bodies in the same place at the same scale, which is the
// only way small changes are visible at all. This is the module that most often
// convinces someone the last two months were not wasted.

import { useState } from "react";
import type { PhotoPair } from "@/lib/insights";

const ANGLE_LABEL: Record<PhotoPair["angle"], string> = {
  front: "Front",
  side: "Side",
  back: "Back",
  other: "Other",
};

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function PhotoCompare({ pairs }: { pairs: PhotoPair[] }) {
  const [angle, setAngle] = useState<PhotoPair["angle"] | null>(
    pairs[0]?.angle ?? null,
  );
  const [wipe, setWipe] = useState(50);

  const pair = pairs.find((p) => p.angle === angle) ?? null;

  // The card that opens this only exists when there's a pair to show; the guard
  // is for the angle chips, which can't select a pair that isn't there.
  if (pair == null) return null;

  return (
    <>
      {pairs.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {pairs.map((p) => (
            <button
              key={p.angle}
              onClick={() => setAngle(p.angle)}
              className="sc-chip px-3 py-1.5 text-sm"
              data-active={p.angle === angle}
            >
              {ANGLE_LABEL[p.angle]}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl bg-[var(--fill)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed,
            short-lived Supabase storage URLs; not optimisable by next/image */}
        <img
          src={pair.latest.url}
          alt={`Latest ${ANGLE_LABEL[pair.angle].toLowerCase()} photo, ${shortDate(pair.latest.date)}`}
          className="block max-h-[28rem] w-full object-contain"
        />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${wipe}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img
            src={pair.start.url}
            alt={`First ${ANGLE_LABEL[pair.angle].toLowerCase()} photo, ${shortDate(pair.start.date)}`}
            className="block h-full max-w-none object-contain object-left"
            // Sized back up to the FULL card width, so the two bodies stay at
            // the same scale as the wipe moves, otherwise the older photo
            // squashes and the comparison is worthless.
            style={{ width: `${(100 / Math.max(wipe, 1)) * 100}%` }}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow"
          style={{ left: `${wipe}%` }}
        />
      </div>

      <label className="flex flex-col gap-2">
        <span className="sr-only">Slide between the first and latest photo</span>
        <input
          type="range"
          min={0}
          max={100}
          value={wipe}
          onChange={(e) => setWipe(Number(e.target.value))}
          className="w-full accent-[var(--g-teal)]"
        />
      </label>

      <div className="flex justify-between text-xs text-[var(--muted)]">
        <span>{shortDate(pair.start.date)}</span>
        <span>{pair.weeksApart} weeks apart</span>
        <span>{shortDate(pair.latest.date)}</span>
      </div>
    </>
  );
}
