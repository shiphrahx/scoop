"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Wine } from "lucide-react";
import { logAlcohol } from "@/app/(app)/plan/actions";
import {
  DRINK_PRESETS,
  defaultAllocation,
  drinkMacros,
  type AlcoholAllocation,
} from "@/lib/alcohol";

// Log an alcoholic drink in a couple of taps: pick a preset (or type a volume +
// ABV), choose whether the alcohol calories land on carbs or fat, and save. The
// default booking is the user's last choice, or whichever macro they have more
// of left today.
export default function AlcoholLogger({
  date,
  carbsLeft,
  fatLeft,
  lastAllocation,
}: {
  date?: string;
  carbsLeft: number | null;
  fatLeft: number | null;
  lastAllocation: AlcoholAllocation | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [volume, setVolume] = useState<string>("");
  const [abv, setAbv] = useState<string>("");
  const [mixer, setMixer] = useState<string>("");
  const [allocation, setAllocation] = useState<AlcoholAllocation>(
    lastAllocation ?? defaultAllocation(carbsLeft, fatLeft),
  );
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const volumeMl = Number(volume);
  const abvPct = Number(abv);
  const valid = volumeMl > 0 && abvPct > 0;

  // Live preview of where this drink lands, recomputed as the inputs change.
  const preview = useMemo(
    () =>
      valid
        ? drinkMacros({
            volumeMl,
            abvPct,
            allocation,
            extraCarbsG: Number(mixer) || 0,
          })
        : null,
    [valid, volumeMl, abvPct, allocation, mixer],
  );

  function choosePreset(id: string) {
    const p = DRINK_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setName(p.name);
    setVolume(String(p.volumeMl));
    setAbv(String(p.abvPct));
    setMixer(String(p.extraCarbsG));
    setSaved(false);
    setErr(null);
  }

  function save() {
    setErr(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await logAlcohol({
          name: name || "Alcoholic drink",
          volumeMl,
          abvPct,
          allocation,
          extraCarbsG: Number(mixer) || 0,
          date,
        });
        setSaved(true);
        setName("");
        setVolume("");
        setAbv("");
        setMixer("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't log that drink.");
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--fill-soft)] py-3 font-medium transition active:scale-[0.99]"
      >
        <Wine size={18} className="text-[var(--ink-teal)]" /> Log a drink
      </button>
    );
  }

  const allocBtn = (a: AlcoholAllocation, label: string) => (
    <button
      onClick={() => {
        setAllocation(a);
        setSaved(false);
      }}
      data-active={allocation === a}
      className="sc-chip flex-1 justify-center py-3 text-base"
    >
      {label}
    </button>
  );

  return (
    <section className="flex flex-col gap-4 sc-card p-5">
      <div className="flex items-center gap-2">
        <Wine size={18} className="text-[var(--ink-teal)]" />
        <h2 className="text-lg font-semibold">Log a drink</h2>
      </div>

      {/* One-tap presets */}
      <div className="flex flex-wrap gap-2">
        {DRINK_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => choosePreset(p.id)}
            data-active={name === p.name}
            className="sc-chip"
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Custom volume + ABV + mixer carbs */}
      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
          Volume (ml)
          <input
            type="number"
            inputMode="decimal"
            value={volume}
            onChange={(e) => {
              setVolume(e.target.value);
              setName("");
              setSaved(false);
            }}
            className="sc-input"
            placeholder="500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
          ABV (%)
          <input
            type="number"
            inputMode="decimal"
            value={abv}
            onChange={(e) => {
              setAbv(e.target.value);
              setName("");
              setSaved(false);
            }}
            className="sc-input"
            placeholder="5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
          Mixer carbs (g)
          <input
            type="number"
            inputMode="decimal"
            value={mixer}
            onChange={(e) => {
              setMixer(e.target.value);
              setSaved(false);
            }}
            className="sc-input"
            placeholder="0"
          />
        </label>
      </div>

      {/* Allocation choice */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Count these calories as</p>
        <div className="flex gap-2">
          {allocBtn("carbs", "Carbs")}
          {allocBtn("fat", "Fat")}
          {allocBtn("split", "Split")}
        </div>
      </div>

      {/* Live landing preview */}
      {preview && (
        <p className="text-sm text-[var(--muted)]">
          ≈ <span className="font-semibold text-[var(--ink)]">{Math.round(preview.kcal)} kcal</span>
          {" · +"}
          {Math.round(preview.carbs_g)} g carbs · +{Math.round(preview.fat_g)} g fat
        </p>
      )}

      <p className="text-xs text-[var(--muted)]">
        Heads up: alcohol pauses fat burning for a while. No big deal — just
        booking the calories so your day stays honest.
      </p>

      {err && (
        <p className="text-sm font-medium text-[var(--danger,#e5484d)]">{err}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="sc-btn sc-btn-soft flex-1 py-3"
        >
          Close
        </button>
        <button
          onClick={save}
          disabled={pending || !valid}
          className="sc-btn sc-btn-primary flex-1 py-3 disabled:opacity-50"
        >
          {pending ? (
            "Saving…"
          ) : saved ? (
            <>
              <Check size={18} /> Logged
            </>
          ) : (
            "Log drink"
          )}
        </button>
      </div>
    </section>
  );
}
