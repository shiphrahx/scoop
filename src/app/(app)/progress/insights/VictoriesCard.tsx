"use client";

// Wins the scale missed.
//
// The maths is about being right. This is about not quitting, which is the
// actual failure mode of every diet: on the weeks the scale sulks, this list is
// the only record of progress that doesn't need it to cooperate.

import { useState } from "react";
import { PartyPopper, Plus, Trash2 } from "lucide-react";
import type { NonScaleVictory } from "@/lib/types";
import { addVictory, deleteVictory } from "../actions";
import { CompactCard, Expandable, Hero } from "./ui";

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function VictoriesCard({
  victories,
  today,
}: {
  victories: NonScaleVictory[];
  today: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await addVictory(text, today);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  // This card carries the "add a win" form, so unlike an insight it renders
  // whether or not there's anything in the list — otherwise there'd be nowhere
  // to write the first one down.
  return (
    <CompactCard
      icon={<PartyPopper size={16} />}
      title="Progress the scale doesn't show"
      detail={
        <>
          {victories.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Stairs without stopping, a shirt that fits, sleeping better.
              Record them here as a record of progress on weeks the scale
              doesn&apos;t move.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {victories.slice(0, 5).map((v) => (
                <VictoryRow key={v.id} victory={v} />
              ))}
            </ul>
          )}

          {victories.length > 5 ? (
            <Expandable label={`All ${victories.length} entries`}>
              <ul className="flex flex-col gap-1.5">
                {victories.slice(5).map((v) => (
                  <VictoryRow key={v.id} victory={v} />
                ))}
              </ul>
            </Expandable>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ran 5k without stopping"
              className="sc-input"
              maxLength={200}
            />
            {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
            <button
              onClick={add}
              disabled={busy || text.trim() === ""}
              className="sc-btn sc-btn-soft self-start"
            >
              <Plus size={16} /> {busy ? "Saving…" : "Add an entry"}
            </button>
          </div>
        </>
      }
    >
      <Hero
        size="sm"
        value={`${victories.length}`}
        label={
          victories.length === 0
            ? "none recorded yet"
            : // The list holds a sentence; the tile holds a line of one.
              victories[0].text.length > 42
              ? `${victories[0].text.slice(0, 40)}…`
              : victories[0].text
        }
        tone={victories.length > 0 ? "good" : "cool"}
      />
    </CompactCard>
  );
}

function VictoryRow({ victory }: { victory: NonScaleVictory }) {
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex items-center gap-2 rounded-xl bg-[var(--tint-teal)] px-3 py-2 text-sm">
      <span className="flex-1">{victory.text}</span>
      <span className="text-xs text-[var(--muted)]">{shortDate(victory.date)}</span>
      <button
        onClick={async () => {
          setBusy(true);
          try {
            await deleteVictory(victory.id);
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        className="text-[var(--muted)]"
        aria-label={`Delete "${victory.text}"`}
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}
