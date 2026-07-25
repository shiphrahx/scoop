"use client";

// Motivation: the reasons to still be here in six weeks.
//
// The maths sections are about being right. This one is about not quitting,
// which is the actual failure mode of every diet. Milestones mark what's already
// banked, the plateau alert tells the truth early enough to act on, and the
// victories log is the only record of progress that doesn't need the scale to
// cooperate.

import { useState } from "react";
import { PartyPopper, Plus, Trash2, TriangleAlert, Trophy } from "lucide-react";
import Link from "next/link";
import type { MilestoneBoard, Plateau } from "@/lib/insights";
import type { NonScaleVictory } from "@/lib/types";
import {
  addMilestone,
  addVictory,
  deleteMilestone,
  deleteVictory,
  setMilestoneReached,
} from "../actions";
import { Expandable, InsightCard, NeedsMoreData, Section, fmt } from "./ui";

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function MotivationSection({
  board,
  plateau,
  victories,
  today,
}: {
  board: MilestoneBoard;
  plateau: Plateau | null;
  victories: NonScaleVictory[];
  today: string;
}) {
  return (
    <Section title="Motivation">
      {plateau?.detected ? (
        <div className="sc-card flex flex-col gap-3 border-l-4 border-l-[var(--accent)] p-5">
          <div className="flex items-center gap-2">
            <TriangleAlert size={18} className="text-[var(--accent)]" />
            <span className="font-semibold">The trend has stalled</span>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Your trend weight has moved {fmt(Math.abs(plateau.changeKg), 2)} kg in{" "}
            {plateau.weeks} weeks. That&apos;s usually not a reason to cut further — a long
            deficit lowers what you burn, and the fix is a diet break or a fresh
            maintenance measurement.
          </p>
          <Link href="/coach" className="sc-btn sc-btn-soft self-start">
            Ask the Coach
          </Link>
        </div>
      ) : null}

      <MilestonesCard board={board} />
      <VictoriesCard victories={victories} today={today} />
    </Section>
  );
}

function MilestonesCard({ board }: { board: MilestoneBoard }) {
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await addMilestone(label, target.trim() === "" ? null : Number(target));
      setLabel("");
      setTarget("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <InsightCard icon={<Trophy size={16} />} title="Milestones">
      {board.reached.length === 0 && board.next == null ? (
        <NeedsMoreData what="weigh in a few times and the first kilo marker appears." />
      ) : (
        <>
          {board.next ? (
            <p className="text-sm text-[var(--foreground)]">
              Next up: <span className="font-semibold">{board.next.label}</span>
              {board.toNextKg != null ? (
                <span className="text-[var(--muted)]">
                  {" "}
                  — {fmt(board.toNextKg)} kg to go
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-[var(--foreground)]">
              Every milestone on the board is behind you.
            </p>
          )}

          {board.reached.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {board.reached.slice(0, 6).map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-xl bg-[var(--tint-green)] px-3 py-2 text-sm"
                >
                  <span className="font-medium">{m.label}</span>
                  <span className="text-[var(--muted)]">
                    {m.reachedOn ? shortDate(m.reachedOn) : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {board.reached.length > 6 ? (
            <Expandable label={`All ${board.reached.length} milestones`}>
              <ul className="flex flex-col gap-1.5">
                {board.reached.slice(6).map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-xl bg-[var(--fill-soft)] px-3 py-2 text-sm"
                  >
                    <span>{m.label}</span>
                    <span className="text-[var(--muted)]">
                      {m.reachedOn ? shortDate(m.reachedOn) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Expandable>
          ) : null}
        </>
      )}

      <Expandable label="Add your own milestone">
        <div className="flex flex-col gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Fit my old jeans"
            className="sc-input"
            maxLength={60}
          />
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            inputMode="decimal"
            placeholder="Target weight in kg (optional)"
            className="sc-input"
          />
          <p className="text-xs text-[var(--muted)]">
            With a weight, it ticks itself off when your trend passes it. Without one,
            you tick it off yourself.
          </p>
          {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
          <button
            onClick={add}
            disabled={busy || label.trim() === ""}
            className="sc-btn sc-btn-soft self-start"
          >
            <Plus size={16} /> {busy ? "Adding…" : "Add milestone"}
          </button>
        </div>
      </Expandable>

      {/* Hand-ticked milestones live here rather than in the reached list, so
          there's somewhere to tick them off from. */}
      <ManualMilestones board={board} />
    </InsightCard>
  );
}

function ManualMilestones({ board }: { board: MilestoneBoard }) {
  const custom = [
    ...board.reached.filter((m) => m.kind === "custom"),
    ...(board.next && board.next.kind === "custom" ? [board.next] : []),
  ];
  const manual = custom.filter((m) => m.targetWeightKg == null);
  const [busy, setBusy] = useState<string | null>(null);

  if (manual.length === 0) return null;

  return (
    <Expandable label="Your own milestones">
      <ul className="flex flex-col gap-1.5">
        {manual.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-2 rounded-xl bg-[var(--fill-soft)] px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={m.reached}
              disabled={busy === m.id}
              onChange={async (e) => {
                setBusy(m.id);
                try {
                  await setMilestoneReached(m.id, e.target.checked);
                } finally {
                  setBusy(null);
                }
              }}
              className="h-5 w-5 accent-[var(--g-green)]"
            />
            <span className={m.reached ? "text-[var(--muted)] line-through" : ""}>
              {m.label}
            </span>
            <button
              onClick={async () => {
                setBusy(m.id);
                try {
                  await deleteMilestone(m.id);
                } finally {
                  setBusy(null);
                }
              }}
              className="ml-auto text-[var(--muted)]"
              aria-label={`Delete ${m.label}`}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    </Expandable>
  );
}

function VictoriesCard({
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

  return (
    <InsightCard icon={<PartyPopper size={16} />} title="Wins the scale missed">
      {victories.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Stairs without stopping, a shirt that fits, sleeping better. Write them down —
          on the weeks the scale sulks, this list is the evidence.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {victories.slice(0, 5).map((v) => (
            <VictoryRow key={v.id} victory={v} />
          ))}
        </ul>
      )}

      {victories.length > 5 ? (
        <Expandable label={`All ${victories.length} wins`}>
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
          <Plus size={16} /> {busy ? "Saving…" : "Add a win"}
        </button>
      </div>
    </InsightCard>
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
