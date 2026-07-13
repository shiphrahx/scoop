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
} from "lucide-react";
import { planMyDay } from "../actions";

type Macro = "carb" | "protein" | "fat";
type Step = Macro | "confirm";
const STEP_ORDER: Step[] = ["carb", "protein", "fat", "confirm"];

// A pick per macro: a string = the chosen pantry item; null = "suggest for me"
// (the app uses the densest source of that macro). Undecided steps default to
// suggest, so tapping straight through simply plans the whole day for you.
type Picks = { carb: string | null; protein: string | null; fat: string | null };

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
}: {
  carbs: string[];
  proteins: string[];
  fats: string[];
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

  const stepIndex = STEP_ORDER.indexOf(step);
  const optionsFor: Record<Macro, string[]> = {
    carb: carbs,
    protein: proteins,
    fat: fats,
  };

  const go = (s: Step) => {
    setErr(null);
    setStep(s);
  };
  const next = () => go(STEP_ORDER[Math.min(stepIndex + 1, STEP_ORDER.length - 1)]);
  const back = () => go(STEP_ORDER[Math.max(stepIndex - 1, 0)]);

  function choose(macro: Macro, value: string | null) {
    setPicks((p) => ({ ...p, [macro]: value }));
  }

  async function build() {
    setErr(null);
    setBusy(true);
    try {
      await planMyDay(picks);
      router.push("/plan/day");
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
          onSelect={(v) => choose(step, v)}
          onSuggest={() => {
            choose(step, null);
            next();
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
    </section>
  );
}

// One macro choice: a grid of pantry chips plus an always-available "suggest for
// me". Tapping a chip pins that food; "suggest" leaves it to the app.
function MacroStep({
  macro,
  options,
  selected,
  onSelect,
  onSuggest,
  onBack,
  onNext,
}: {
  macro: Macro;
  options: string[];
  selected: string | null;
  onSelect: (v: string | null) => void;
  onSuggest: () => void;
  onBack?: () => void;
  onNext: () => void;
}) {
  const meta = MACRO_META[macro];
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

      <button
        onClick={onSuggest}
        className="sc-btn sc-btn-soft"
      >
        <Wand2 size={18} /> Suggest one for me
      </button>

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
  const rows: { macro: Macro; label: string; value: string | null }[] = [
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
              {value ?? (
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
