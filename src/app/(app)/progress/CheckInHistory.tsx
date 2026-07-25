"use client";

import { useState } from "react";
import { ChevronDown, ClipboardList, Trash2 } from "lucide-react";
import { deleteCheckIn } from "./check-in/actions";
import type { CheckIn, CheckInPhoto } from "@/lib/types";

type Entry = CheckIn & { photos: CheckInPhoto[] };

const MEASURES = [
  { key: "chest_cm", label: "Chest" },
  { key: "waist_cm", label: "Waist" },
  { key: "arms_cm", label: "Arms" },
  { key: "thighs_cm", label: "Thighs" },
  { key: "hips_cm", label: "Hips" },
] as const;

const weekLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// Every past weekly check-in, newest first, each expandable to its measurements,
// note and photos. View-only apart from deleting a whole check-in.
export default function CheckInHistory({ initial }: { initial: Entry[] }) {
  const [entries, setEntries] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("Delete this check-in and its photos? This can't be undone."))
      return;
    setDeleting(id);
    try {
      await deleteCheckIn(id);
      setEntries((e) => e.filter((x) => x.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
        <ClipboardList size={22} className="text-[var(--muted)]" />
        <p className="text-sm text-[var(--muted)]">
          No check-ins yet. Do your first one above.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((c) => {
        const isOpen = open === c.id;
        const taken = MEASURES.filter((m) => c[m.key] != null);
        return (
          <li key={c.id} className="sc-card overflow-hidden">
            <button
              onClick={() => setOpen(isOpen ? null : c.id)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <div className="flex flex-col">
                <span className="font-semibold">Week of {weekLabel(c.week_start)}</span>
                <span className="text-sm text-[var(--muted)]">
                  {taken.length} measurement{taken.length === 1 ? "" : "s"}
                  {c.weight_kg != null && ` · ${c.weight_kg.toFixed(1)} kg`}
                  {c.photos.length > 0 &&
                    ` · ${c.photos.length} photo${c.photos.length === 1 ? "" : "s"}`}
                </span>
              </div>
              <ChevronDown
                size={18}
                className={`ml-auto text-[var(--muted)] transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isOpen && (
              <div className="flex flex-col gap-4 border-t border-[var(--border)] p-4">
                {taken.length > 0 && (
                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    {taken.map((m) => (
                      <div key={m.key} className="flex flex-col">
                        <dt className="text-[var(--muted)]">{m.label}</dt>
                        <dd className="font-semibold tabular-nums">
                          {(c[m.key] as number).toFixed(1)} cm
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {c.note && (
                  <p className="rounded-xl bg-[var(--fill-soft)] px-3 py-2 text-sm text-[var(--foreground)]">
                    {c.note}
                  </p>
                )}

                {c.photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {c.photos.map((p) => (
                      <a
                        key={p.id}
                        href={p.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="relative aspect-square overflow-hidden rounded-xl bg-[var(--fill)]"
                      >
                        {p.signed_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.signed_url}
                            alt={p.angle}
                            className="h-full w-full object-cover"
                          />
                        )}
                        <span className="absolute bottom-1 left-1.5 text-xs font-semibold capitalize text-white drop-shadow">
                          {p.angle}
                        </span>
                      </a>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => remove(c.id)}
                  disabled={deleting === c.id}
                  className="sc-btn sc-btn-neutral w-full text-[var(--accent)] disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  {deleting === c.id ? "Deleting…" : "Delete check-in"}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
