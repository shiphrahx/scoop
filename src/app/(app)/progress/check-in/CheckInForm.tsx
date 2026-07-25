"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { saveCheckIn, type SaveCheckInResult } from "./actions";
import PhotoUploader from "./PhotoUploader";

const fields = [
  { key: "chest_cm", label: "Chest" },
  { key: "waist_cm", label: "Waist" },
  { key: "arms_cm", label: "Arms" },
  { key: "thighs_cm", label: "Thighs" },
  { key: "hips_cm", label: "Hips" },
] as const;

type MKey = (typeof fields)[number]["key"];

export interface CheckInPrefill {
  chest_cm: number | null;
  waist_cm: number | null;
  arms_cm: number | null;
  thighs_cm: number | null;
  hips_cm: number | null;
  weight_kg: number | null;
  note: string | null;
}

const numOrNull = (s: string): number | null => (s.trim() ? Number(s) : null);

export default function CheckInForm({
  prefill,
  alreadyDone,
}: {
  prefill: CheckInPrefill;
  alreadyDone: boolean;
}) {
  const [values, setValues] = useState<Record<MKey, string>>({
    chest_cm: prefill.chest_cm?.toString() ?? "",
    waist_cm: prefill.waist_cm?.toString() ?? "",
    arms_cm: prefill.arms_cm?.toString() ?? "",
    thighs_cm: prefill.thighs_cm?.toString() ?? "",
    hips_cm: prefill.hips_cm?.toString() ?? "",
  });
  const [weight, setWeight] = useState(prefill.weight_kg?.toString() ?? "");
  const [note, setNote] = useState(prefill.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveCheckInResult | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await saveCheckIn({
        chest_cm: numOrNull(values.chest_cm),
        waist_cm: numOrNull(values.waist_cm),
        arms_cm: numOrNull(values.arms_cm),
        thighs_cm: numOrNull(values.thighs_cm),
        hips_cm: numOrNull(values.hips_cm),
        weight_kg: numOrNull(weight),
        note: note.trim() || null,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the check-in.");
    } finally {
      setSaving(false);
    }
  }

  // Confirmation view once the check-in is saved.
  if (result) {
    return (
      <div className="sc-card flex flex-col gap-5 p-5">
        <div className="flex items-center gap-2 text-[var(--ink-green)]">
          <span className="sc-icon-dot">
            <Check size={16} />
          </span>
          <span className="font-semibold">Check-in saved for this week</span>
        </div>

        {result.deltas.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Since your last check-in
            </h3>
            <ul className="flex flex-col divide-y divide-[var(--border)] rounded-2xl bg-[var(--fill-soft)] p-1">
              {result.deltas.map((d) => {
                const down = d.delta < 0;
                const flat = d.delta === 0;
                return (
                  <li
                    key={d.key}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="text-[var(--muted)]">{d.label}</span>
                    <span
                      className="font-semibold tabular-nums"
                      style={{
                        color: flat
                          ? "var(--muted)"
                          : down
                            ? "var(--ink-green)"
                            : "var(--accent)",
                      }}
                    >
                      {d.delta > 0 ? "+" : ""}
                      {d.delta} {d.unit}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            This is your first check-in — next week you&apos;ll see how things moved.
          </p>
        )}

        <PhotoUploader checkInId={result.checkInId} />

        <Link href="/progress" className="sc-btn sc-btn-primary w-full py-4 text-lg">
          Back to Progress <ArrowRight size={18} />
        </Link>
      </div>
    );
  }

  return (
    <div className="sc-card flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Measurements (cm)
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-[var(--muted)]">{f.label}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={values[f.key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
                placeholder="—"
                className="sc-input text-lg"
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-[var(--muted)]">Weight (kg)</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="optional"
              className="sc-input text-lg"
            />
          </label>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-[var(--muted)]">Note (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="How's it going?"
          className="sc-input resize-none"
        />
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="sc-btn sc-btn-primary w-full py-4 text-lg"
      >
        {saving ? "Saving…" : alreadyDone ? "Update check-in" : "Save check-in"}
      </button>
    </div>
  );
}
