"use client";

import { useState } from "react";
import {
  ChevronLeft,
  Minus,
  Plus,
  X,
  Utensils,
  ScanBarcode,
  Sparkles,
  Drumstick,
  Salad,
  Sprout,
  Armchair,
  Footprints,
  Bike,
  Dumbbell,
  Trophy,
  Turtle,
  Flame,
  Venus,
  Mars,
  type LucideIcon,
} from "lucide-react";
import { saveOnboarding, type OnboardingInput } from "./actions";
import type {
  ActivityLevel,
  DietType,
  GoalPace,
  Sex,
} from "@/lib/types";

const CURRENT_YEAR = new Date().getFullYear();

const ALLERGENS = [
  "Milk",
  "Eggs",
  "Peanuts",
  "Tree nuts",
  "Soy",
  "Gluten",
  "Fish",
  "Shellfish",
  "Sesame",
];

const DISLIKES = [
  "Mushrooms",
  "Olives",
  "Tomatoes",
  "Onions",
  "Broccoli",
  "Coriander",
  "Spicy food",
  "Blue cheese",
];

type State = {
  diet_type?: DietType;
  allergies: string[];
  dislikes: string[];
  goal_pace?: GoalPace;
  activity_level?: ActivityLevel;
  sex?: Sex;
  height_cm: number;
  weight_kg: number;
  age: number;
};

export default function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<State>({
    allergies: [],
    dislikes: [],
    height_cm: 170,
    weight_kg: 80,
    age: 30,
  });

  const steps = [
    "welcome",
    "diet",
    "allergies",
    "dislikes",
    "activity",
    "pace",
    "sex",
    "height",
    "weight",
    "age",
  ] as const;

  const total = steps.length;
  const next = () => setStep((s) => Math.min(s + 1, total - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  function toggle(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
  }

  async function finish() {
    setSaving(true);
    const input: OnboardingInput = {
      diet_type: state.diet_type!,
      allergies: state.allergies,
      dislikes: state.dislikes,
      goal_pace: state.goal_pace!,
      activity_level: state.activity_level!,
      sex: state.sex!,
      height_cm: Math.round(state.height_cm),
      weight_kg: Math.round(state.weight_kg * 10) / 10,
      birth_year: CURRENT_YEAR - state.age,
    };
    await saveOnboarding(input);
  }

  const current = steps[step];

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col px-5 pb-8 pt-6">
      {/* progress — hidden on the welcome intro */}
      {step > 0 && (
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={back}
            className="text-[var(--muted)] transition active:scale-90"
            aria-label="Back"
          >
            <ChevronLeft size={26} />
          </button>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${(step / (total - 1)) * 100}%`,
                background: "var(--grad-primary)",
              }}
            />
          </div>
        </div>
      )}

      {current === "welcome" && <Welcome onStart={next} />}

      {current === "diet" && (
        <Choice
          title="How do you eat?"
          options={[
            { value: "regular", label: "Everything", icon: Drumstick },
            { value: "vegetarian", label: "Vegetarian", icon: Salad },
            { value: "vegan", label: "Vegan", icon: Sprout },
          ]}
          selected={state.diet_type}
          onPick={(v) => {
            setState({ ...state, diet_type: v as DietType });
            next();
          }}
        />
      )}

      {current === "allergies" && (
        <Chips
          title="Any allergies?"
          hint="Tap all that apply — or none. Add your own if it's missing."
          options={ALLERGENS}
          selected={state.allergies}
          customPlaceholder="e.g. Kiwi"
          onToggle={(v) =>
            setState({ ...state, allergies: toggle(state.allergies, v) })
          }
          onNext={next}
        />
      )}

      {current === "dislikes" && (
        <Chips
          title="Anything you hate?"
          hint="We'll never suggest these. Add your own if it's missing."
          options={DISLIKES}
          selected={state.dislikes}
          customPlaceholder="e.g. Beetroot"
          onToggle={(v) =>
            setState({ ...state, dislikes: toggle(state.dislikes, v) })
          }
          onNext={next}
        />
      )}

      {current === "activity" && (
        <Choice
          title="How active are you?"
          hint="Think about a normal week, exercise plus your job."
          options={[
            {
              value: "sedentary",
              label: "Mostly sitting",
              icon: Armchair,
              desc: "Desk job, little or no exercise",
            },
            {
              value: "light",
              label: "Lightly active",
              icon: Footprints,
              desc: "Light exercise 1–3 days a week",
            },
            {
              value: "moderate",
              label: "Active",
              icon: Bike,
              desc: "Moderate exercise 3–5 days a week",
            },
            {
              value: "active",
              label: "Very active",
              icon: Dumbbell,
              desc: "Hard exercise 6–7 days a week",
            },
            {
              value: "very_active",
              label: "Athlete",
              icon: Trophy,
              desc: "Hard training twice a day or a physical job",
            },
          ]}
          selected={state.activity_level}
          onPick={(v) => {
            setState({ ...state, activity_level: v as ActivityLevel });
            next();
          }}
        />
      )}

      {current === "pace" && (
        <Choice
          title="How fast do you want to lose?"
          hint="Slower is easier to stick to. You can change this later."
          options={[
            {
              value: "gentle",
              label: "Gentle & steady",
              icon: Turtle,
              desc: "About 0.25 kg (½ lb) a week",
            },
            {
              value: "steady",
              label: "Standard",
              icon: Footprints,
              desc: "About 0.5 kg (1 lb) a week",
            },
            {
              value: "aggressive",
              label: "Push hard",
              icon: Flame,
              desc: "About 0.75 kg (1½ lb) a week",
            },
          ]}
          selected={state.goal_pace}
          onPick={(v) => {
            setState({ ...state, goal_pace: v as GoalPace });
            next();
          }}
        />
      )}

      {current === "sex" && (
        <Choice
          title="Sex (for the maths)"
          hint="Used only to estimate your calorie needs."
          options={[
            { value: "female", label: "Female", icon: Venus },
            { value: "male", label: "Male", icon: Mars },
          ]}
          selected={state.sex}
          onPick={(v) => {
            setState({ ...state, sex: v as Sex });
            next();
          }}
        />
      )}

      {current === "height" && (
        <MeasureStepper
          title="How tall are you?"
          kind="height"
          valueMetric={state.height_cm}
          minMetric={120}
          maxMetric={220}
          onChange={(v) => setState({ ...state, height_cm: v })}
          onNext={next}
        />
      )}

      {current === "weight" && (
        <MeasureStepper
          title="What do you weigh now?"
          kind="weight"
          valueMetric={state.weight_kg}
          minMetric={35}
          maxMetric={250}
          onChange={(v) => setState({ ...state, weight_kg: v })}
          onNext={next}
        />
      )}

      {current === "age" && (
        <Stepper
          title="How old are you?"
          unit="years"
          value={state.age}
          min={13}
          max={100}
          step={1}
          display={(v) => `${v}`}
          onChange={(v) => setState({ ...state, age: v })}
          onNext={finish}
          nextLabel={saving ? "Setting up…" : "Finish"}
          nextDisabled={saving}
        />
      )}
    </main>
  );
}

// First thing a brand-new user sees — a plain-words pitch, then one button in.
function Welcome({ onStart }: { onStart: () => void }) {
  const points: { icon: LucideIcon; text: string }[] = [
    { icon: Utensils, text: "We tell you the portion to eat — no food searching." },
    { icon: ScanBarcode, text: "Scan a barcode or a grocery photo to log in a tap." },
    { icon: Sparkles, text: "A coach adjusts your targets from your real results." },
  ];
  return (
    <section className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span
          className="grid h-24 w-24 place-items-center rounded-[2rem] text-white"
          style={{ background: "var(--grad-primary)", boxShadow: "var(--shadow-glow)" }}
          aria-hidden
        >
          <span className="text-6xl font-bold">S</span>
        </span>
        <h1 className="text-3xl font-semibold">Welcome to Scoop</h1>
        <p className="max-w-xs text-[var(--muted)]">
          Let&apos;s set up your plan. Takes about a minute — mostly tapping.
        </p>
        <ul className="mt-2 flex w-full flex-col gap-3 text-left">
          {points.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.text} className="sc-card flex items-center gap-3 p-4">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ background: "var(--tint-teal)", color: "var(--ink-teal)" }}
                >
                  <Icon size={20} />
                </span>
                <span className="text-sm font-medium">{p.text}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-auto pt-8">
        <NextButton onClick={onStart} label="Let's go" />
      </div>
    </section>
  );
}

function Choice({
  title,
  hint,
  options,
  selected,
  onPick,
}: {
  title: string;
  hint?: string;
  options: { value: string; label: string; icon: LucideIcon; desc?: string }[];
  selected?: string;
  onPick: (value: string) => void;
}) {
  return (
    <section className="flex flex-1 flex-col">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {hint && (
        <p className="mb-6 mt-1 text-sm text-[var(--muted)]">{hint}</p>
      )}
      <div className={`flex flex-col gap-3 ${hint ? "" : "mt-6"}`}>
        {options.map((o) => {
          const Icon = o.icon;
          const active = selected === o.value;
          return (
            <button
              key={o.value}
              onClick={() => onPick(o.value)}
              className={`flex items-center gap-4 rounded-2xl border px-5 py-4 text-left transition active:scale-95 ${
                active ? "border-transparent" : "border-[var(--border)] bg-white/40"
              }`}
              style={active ? { background: "var(--tint-teal)" } : undefined}
            >
              <span
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
                  active ? "text-white" : "text-[var(--ink-teal)]"
                }`}
                style={{
                  background: active ? "var(--grad-primary)" : "var(--fill)",
                }}
              >
                <Icon size={22} />
              </span>
              <span className="flex flex-col">
                <span className="text-lg font-semibold">{o.label}</span>
                {o.desc && (
                  <span className="text-sm text-[var(--muted)]">{o.desc}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Chips({
  title,
  hint,
  options,
  selected,
  customPlaceholder,
  onToggle,
  onNext,
}: {
  title: string;
  hint: string;
  options: string[];
  selected: string[];
  customPlaceholder: string;
  onToggle: (value: string) => void;
  onNext: () => void;
}) {
  const [custom, setCustom] = useState("");
  const extras = selected.filter((s) => !options.includes(s));

  function addCustom() {
    const value = custom.trim();
    if (!value) return;
    if (!selected.includes(value)) onToggle(value);
    setCustom("");
  }

  return (
    <section className="flex flex-1 flex-col">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mb-6 mt-1 text-sm text-[var(--muted)]">{hint}</p>

      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o} label={o} on={selected.includes(o)} onClick={() => onToggle(o)} />
        ))}
        {extras.map((o) => (
          <Chip key={o} label={o} on removable onClick={() => onToggle(o)} />
        ))}
      </div>

      {/* Other — manual entry */}
      <div className="mt-4 flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder={`Other — ${customPlaceholder}`}
          className="sc-input flex-1 rounded-full"
        />
        <button
          onClick={addCustom}
          disabled={!custom.trim()}
          className="sc-btn sc-btn-neutral rounded-full px-5"
        >
          Add
        </button>
      </div>

      <div className="mt-auto pt-8">
        <NextButton onClick={onNext} label="Next" />
      </div>
    </section>
  );
}

function Chip({
  label,
  on,
  removable,
  onClick,
}: {
  label: string;
  on: boolean;
  removable?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} data-active={on} className="sc-chip active:scale-95">
      {label}
      {removable && <X size={14} />}
    </button>
  );
}

// ---- Numeric steppers -----------------------------------------------------

function Stepper({
  title,
  unit,
  value,
  min,
  max,
  step,
  display,
  onChange,
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
}: {
  title: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: (v: number) => string;
  onChange: (value: number) => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <section className="flex flex-1 flex-col">
      <h1 className="mb-8 text-2xl font-semibold">{title}</h1>
      <StepperRow
        onMinus={() => onChange(clamp(value - step))}
        onPlus={() => onChange(clamp(value + step))}
        big={display(value)}
        unit={unit}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-8 w-full accent-[var(--g-teal)]"
      />
      <div className="mt-auto pt-8">
        <NextButton onClick={onNext} label={nextLabel} disabled={nextDisabled} />
      </div>
    </section>
  );
}

const LB_PER_KG = 2.20462;
const CM_PER_IN = 2.54;

// Height/weight stepper with a metric ⇄ imperial toggle. Always stores metric.
function MeasureStepper({
  title,
  kind,
  valueMetric,
  minMetric,
  maxMetric,
  onChange,
  onNext,
}: {
  title: string;
  kind: "height" | "weight";
  valueMetric: number;
  minMetric: number;
  maxMetric: number;
  onChange: (metric: number) => void;
  onNext: () => void;
}) {
  const [imperial, setImperial] = useState(false);
  const clamp = (v: number) => Math.min(maxMetric, Math.max(minMetric, v));

  // Metric change per ± tap: 1 cm / 1 kg, or 1 inch / 1 lb in imperial.
  const stepMetric = imperial
    ? kind === "height"
      ? CM_PER_IN
      : 1 / LB_PER_KG
    : 1;

  const bump = (dir: number) => onChange(clamp(valueMetric + dir * stepMetric));

  let big: string;
  let unit: string;
  if (kind === "height") {
    if (imperial) {
      const totalIn = valueMetric / CM_PER_IN;
      const ft = Math.floor(totalIn / 12);
      const inch = Math.round(totalIn - ft * 12);
      big = `${ft}′ ${inch}″`;
      unit = "";
    } else {
      big = `${Math.round(valueMetric)}`;
      unit = "cm";
    }
  } else {
    if (imperial) {
      big = `${Math.round(valueMetric * LB_PER_KG)}`;
      unit = "lb";
    } else {
      big = `${Math.round(valueMetric)}`;
      unit = "kg";
    }
  }

  const [metricLabel, imperialLabel] =
    kind === "height" ? ["cm", "ft / in"] : ["kg", "lb"];

  return (
    <section className="flex flex-1 flex-col">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>

      {/* unit toggle */}
      <div className="mx-auto mb-8 flex rounded-full bg-[var(--fill)] p-1">
        <UnitTab on={!imperial} label={metricLabel} onClick={() => setImperial(false)} />
        <UnitTab on={imperial} label={imperialLabel} onClick={() => setImperial(true)} />
      </div>

      <StepperRow
        onMinus={() => bump(-1)}
        onPlus={() => bump(1)}
        big={big}
        unit={unit}
      />

      <input
        type="range"
        min={minMetric}
        max={maxMetric}
        step={0.1}
        value={valueMetric}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-8 w-full accent-[var(--g-teal)]"
      />

      <div className="mt-auto pt-8">
        <NextButton onClick={onNext} label="Next" />
      </div>
    </section>
  );
}

function UnitTab({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-5 py-1.5 text-sm font-semibold transition ${
        on ? "text-white" : ""
      }`}
      style={
        on ? { background: "var(--grad-primary)" } : { color: "var(--muted)" }
      }
    >
      {label}
    </button>
  );
}

function StepperRow({
  onMinus,
  onPlus,
  big,
  unit,
}: {
  onMinus: () => void;
  onPlus: () => void;
  big: string;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-center gap-6">
      <button
        onClick={onMinus}
        className="grid h-14 w-14 place-items-center rounded-full bg-[var(--fill)] active:scale-90"
        aria-label="Decrease"
      >
        <Minus size={24} />
      </button>
      <div className="text-center">
        <div className="text-5xl font-bold tabular-nums">{big}</div>
        {unit && <div className="text-sm text-[var(--muted)]">{unit}</div>}
      </div>
      <button
        onClick={onPlus}
        className="grid h-14 w-14 place-items-center rounded-full bg-[var(--fill)] active:scale-90"
        aria-label="Increase"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}

function NextButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="sc-btn sc-btn-primary w-full py-4 text-lg"
    >
      {label}
    </button>
  );
}
