"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Wand2,
  Wheat,
  Drumstick,
  Droplet,
  ScanBarcode,
} from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { OffProduct } from "@/lib/types";
import type { DayPick } from "@/lib/mealplan";
import { planMyDay } from "../actions";

type Macro = "carb" | "protein" | "fat";
type Step = Macro | "confirm";
const STEP_ORDER: Step[] = ["carb", "protein", "fat", "confirm"];

// A pick per macro (see DayPick): a pantry item name, a scanned product with its
// own macros, or null = "suggest for me" (the densest source of that macro).
// Undecided steps default to suggest, so tapping straight through plans the day.
type Picks = { carb: DayPick; protein: DayPick; fat: DayPick };

// A pick's display name, or null for "suggest for me".
function pickLabel(pick: DayPick): string | null {
  if (pick == null) return null;
  return typeof pick === "string" ? pick : pick.name;
}

const MACRO_META: Record<
  Macro,
  { title: string; sub: string; icon: ReactNode; empty: string }
> = {
  carb: {
    title: "Pick a base carb",
    sub: "The base of every meal today — from your pantry.",
    icon: <Wheat size={20} />,
    empty: "No base carbs in your pantry. We'll skip the carb, or add some first.",
  },
  protein: {
    title: "Pick a protein",
    sub: "The star of the plate, to match your carb.",
    icon: <Drumstick size={20} />,
    empty: "No proteins in your pantry. We'll skip it, or add some first.",
  },
  fat: {
    title: "Pick a fat",
    sub: "Oil, nuts, cheese — to round the macros out.",
    icon: <Droplet size={20} />,
    empty: "No fats in your pantry. We'll skip it, or add some first.",
  },
};

// The guided "plan the day for me" flow. One decision per screen: choose a carb,
// then a protein, then a fat — each either a pantry item you tap, or "suggest
// for me". A final screen confirms the picks and builds the day from just them.
export default function BuildWizard({
  carbs,
  proteins,
  fats,
  date,
}: {
  carbs: string[];
  proteins: string[];
  fats: string[];
  date?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("carb");
  const [picks, setPicks] = useState<Picks>({
    carb: null,
    protein: null,
    fat: null,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const stepIndex = STEP_ORDER.indexOf(step);
  const optionsFor: Record<Macro, string[]> = {
    carb: carbs,
    protein: proteins,
    fat: fats,
  };

  const go = (s: Step) => {
    setErr(null);
    setScanNote(null);
    setStep(s);
  };
  const next = () => go(STEP_ORDER[Math.min(stepIndex + 1, STEP_ORDER.length - 1)]);
  const back = () => go(STEP_ORDER[Math.max(stepIndex - 1, 0)]);

  function choose(macro: Macro, value: DayPick) {
    setPicks((p) => ({ ...p, [macro]: value }));
  }

  // Scan a barcode as this macro's pick: look the product up on Open Food Facts
  // (same endpoint the pantry scanner uses), keep its per-100g macros, and move
  // to the next step. The scanned food needn't be in the pantry — the user chose
  // exactly it, so the planner portions the day around it directly.
  async function handleScan(barcode: string) {
    if (step === "confirm") return;
    setScanning(false);
    setScanNote("Looking up…");
    try {
      const res = await fetch(`/api/off/${encodeURIComponent(barcode)}`);
      if (!res.ok) {
        setScanNote(`No match for ${barcode}. Pick from your pantry instead.`);
        return;
      }
      const p = (await res.json()) as OffProduct;
      choose(step, {
        name: p.name,
        kcal_100g: p.kcal_100g,
        protein_100g: p.protein_100g,
        carbs_100g: p.carbs_100g,
        fat_100g: p.fat_100g,
        // Don't portion more than the pack holds (unknown → no cap).
        available_g: p.pack_size_g != null ? p.pack_size_g : undefined,
      });
      setScanNote(null);
      next();
    } catch {
      setScanNote("Lookup failed. Pick from your pantry instead.");
    }
  }

  async function build() {
    setErr(null);
    setBusy(true);
    try {
      await planMyDay(picks, date);
      router.push(date ? `/plan/day?date=${date}` : "/plan/day");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't build your day.");
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <StepDots total={STEP_ORDER.length} active={stepIndex} />

      {err && (
        <p className="text-center text-sm font-medium text-[var(--danger,#e5484d)]">
          {err}
        </p>
      )}

      {step !== "confirm" ? (
        <MacroStep
          macro={step}
          options={optionsFor[step]}
          selected={picks[step]}
          scanNote={scanNote}
          onSelect={(v) => choose(step, v)}
          onSuggest={() => {
            choose(step, null);
            next();
          }}
          onScan={() => {
            setScanNote(null);
            setScanning(true);
          }}
          onBack={stepIndex > 0 ? back : undefined}
          onNext={next}
        />
      ) : (
        <ConfirmStep
          picks={picks}
          busy={busy}
          onBack={back}
          onBuild={build}
        />
      )}

      {scanning && (
        <BarcodeScanner
          onDetected={handleScan}
          onClose={() => setScanning(false)}
        />
      )}
    </section>
  );
}

// One macro choice: a grid of pantry chips plus an always-available "suggest for
// me". Tapping a chip pins that food; "suggest" leaves it to the app.
function MacroStep({
  macro,
  options,
  selected,
  scanNote,
  onSelect,
  onSuggest,
  onScan,
  onBack,
  onNext,
}: {
  macro: Macro;
  options: string[];
  selected: DayPick;
  scanNote: string | null;
  onSelect: (v: DayPick) => void;
  onSuggest: () => void;
  onScan: () => void;
  onBack?: () => void;
  onNext: () => void;
}) {
  const meta = MACRO_META[macro];
  // A scanned pick is an object; a pantry chip is a string. Only a string can
  // light a chip — a scanned item is shown on its own line below.
  const scanned = selected != null && typeof selected !== "string" ? selected : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl"
          style={{ background: "var(--tint-teal)", color: "var(--ink-teal)" }}
        >
          {meta.icon}
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{meta.title}</h2>
          <p className="text-sm text-[var(--muted)]">{meta.sub}</p>
        </div>
      </div>

      {options.length === 0 ? (
        <p className="sc-card p-4 text-sm text-[var(--muted)]">{meta.empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => onSelect(selected === opt ? null : opt)}
              data-active={selected === opt}
              className="sc-chip"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {scanned && (
        <p className="sc-card flex items-center gap-2 p-3 text-sm font-medium">
          <ScanBarcode size={16} className="shrink-0 text-[var(--ink-teal)]" />
          <span className="min-w-0 truncate">Scanned: {scanned.name}</span>
        </p>
      )}

      <div className="flex gap-2">
        <button onClick={onSuggest} className="sc-btn sc-btn-soft flex-1">
          <Wand2 size={18} /> Suggest one
        </button>
        <button onClick={onScan} className="sc-btn sc-btn-soft flex-1">
          <ScanBarcode size={18} /> Scan a barcode
        </button>
      </div>

      {scanNote && (
        <p className="text-center text-xs font-medium text-[var(--muted)]">
          {scanNote}
        </p>
      )}

      <div className="flex gap-2">
        {onBack && (
          <button onClick={onBack} className="sc-btn sc-btn-neutral flex-1">
            <ArrowLeft size={18} /> Back
          </button>
        )}
        <button onClick={onNext} className="sc-btn sc-btn-primary flex-1">
          {selected ? "Next" : "Skip"} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

function ConfirmStep({
  picks,
  busy,
  onBack,
  onBuild,
}: {
  picks: Picks;
  busy: boolean;
  onBack: () => void;
  onBuild: () => void;
}) {
  const rows: { macro: Macro; label: string; value: DayPick }[] = [
    { macro: "carb", label: "Carb", value: picks.carb },
    { macro: "protein", label: "Protein", value: picks.protein },
    { macro: "fat", label: "Fat", value: picks.fat },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Build my day from these?</h2>
        <p className="text-sm text-[var(--muted)]">
          Every open meal is portioned from just these to hit today&apos;s macros.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map(({ macro, label, value }) => (
          <li
            key={macro}
            className="flex items-center justify-between gap-3 sc-card p-4"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {label}
            </span>
            <span className="min-w-0 truncate text-right font-medium">
              {pickLabel(value) ?? (
                <span className="inline-flex items-center gap-1 text-[var(--ink-teal)]">
                  <Wand2 size={15} /> Suggest for me
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          disabled={busy}
          className="sc-btn sc-btn-neutral flex-1"
        >
          <ArrowLeft size={18} /> Back
        </button>
        <button
          onClick={onBuild}
          disabled={busy}
          className="sc-btn sc-btn-primary flex-1 py-4 text-lg"
        >
          {busy ? (
            "Building…"
          ) : (
            <>
              <Sparkles size={20} /> Build my day
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function StepDots({ total, active }: { total: number; active: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="h-2 rounded-full transition-all"
          style={{
            width: i === active ? 24 : 8,
            background: i <= active ? "var(--ink-teal)" : "var(--fill)",
          }}
        />
      ))}
    </div>
  );
}
