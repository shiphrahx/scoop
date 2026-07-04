"use client";

import { useState } from "react";
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
      height_cm: state.height_cm,
      weight_kg: state.weight_kg,
      birth_year: CURRENT_YEAR - state.age,
    };
    await saveOnboarding(input);
  }

  const current = steps[step];

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col px-5 pb-8 pt-6">
      {/* progress */}
      <div className="mb-6 flex items-center gap-3">
        {step > 0 ? (
          <button
            onClick={back}
            className="text-2xl text-black/40 dark:text-white/40"
            aria-label="Back"
          >
            ‹
          </button>
        ) : (
          <span className="w-6" />
        )}
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      {current === "diet" && (
        <Choice
          title="How do you eat?"
          options={[
            { value: "regular", label: "Everything", icon: "🍗" },
            { value: "vegetarian", label: "Vegetarian", icon: "🥦" },
            { value: "vegan", label: "Vegan", icon: "🌱" },
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
          hint="Tap all that apply — or none."
          options={ALLERGENS}
          selected={state.allergies}
          onToggle={(v) =>
            setState({ ...state, allergies: toggle(state.allergies, v) })
          }
          onNext={next}
        />
      )}

      {current === "dislikes" && (
        <Chips
          title="Anything you hate?"
          hint="We'll never suggest these."
          options={DISLIKES}
          selected={state.dislikes}
          onToggle={(v) =>
            setState({ ...state, dislikes: toggle(state.dislikes, v) })
          }
          onNext={next}
        />
      )}

      {current === "activity" && (
        <Choice
          title="How active are you?"
          options={[
            { value: "sedentary", label: "Mostly sitting", icon: "🪑" },
            { value: "light", label: "Lightly active", icon: "🚶" },
            { value: "moderate", label: "Active", icon: "🏃" },
            { value: "active", label: "Very active", icon: "💪" },
            { value: "very_active", label: "Athlete", icon: "🏆" },
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
          options={[
            { value: "gentle", label: "Gentle & steady", icon: "🐢" },
            { value: "steady", label: "Standard", icon: "🚶" },
            { value: "aggressive", label: "Push hard", icon: "🔥" },
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
          options={[
            { value: "female", label: "Female", icon: "♀️" },
            { value: "male", label: "Male", icon: "♂️" },
          ]}
          selected={state.sex}
          onPick={(v) => {
            setState({ ...state, sex: v as Sex });
            next();
          }}
        />
      )}

      {current === "height" && (
        <Stepper
          title="How tall are you?"
          unit="cm"
          value={state.height_cm}
          min={120}
          max={220}
          step={1}
          onChange={(v) => setState({ ...state, height_cm: v })}
          onNext={next}
        />
      )}

      {current === "weight" && (
        <Stepper
          title="What do you weigh now?"
          unit="kg"
          value={state.weight_kg}
          min={35}
          max={250}
          step={1}
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
          onChange={(v) => setState({ ...state, age: v })}
          onNext={finish}
          nextLabel={saving ? "Setting up…" : "Finish"}
          nextDisabled={saving}
        />
      )}
    </main>
  );
}

function Choice({
  title,
  options,
  selected,
  onPick,
}: {
  title: string;
  options: { value: string; label: string; icon: string }[];
  selected?: string;
  onPick: (value: string) => void;
}) {
  return (
    <section className="flex flex-1 flex-col">
      <h1 className="mb-6 text-2xl font-extrabold">{title}</h1>
      <div className="flex flex-col gap-3">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onPick(o.value)}
            className={`flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left text-lg font-bold transition active:scale-95 ${
              selected === o.value
                ? "border-green-500 bg-green-50 dark:bg-green-500/10"
                : "border-black/10 dark:border-white/15"
            }`}
          >
            <span className="text-3xl">{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Chips({
  title,
  hint,
  options,
  selected,
  onToggle,
  onNext,
}: {
  title: string;
  hint: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onNext: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col">
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <p className="mb-6 mt-1 text-sm text-black/50 dark:text-white/50">
        {hint}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className={`rounded-full border-2 px-4 py-2 font-semibold transition active:scale-95 ${
              selected.includes(o)
                ? "border-green-500 bg-green-500 text-white"
                : "border-black/10 dark:border-white/15"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
      <div className="mt-auto pt-8">
        <NextButton onClick={onNext} label="Next" />
      </div>
    </section>
  );
}

function Stepper({
  title,
  unit,
  value,
  min,
  max,
  step,
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
  onChange: (value: number) => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <section className="flex flex-1 flex-col">
      <h1 className="mb-8 text-2xl font-extrabold">{title}</h1>
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={() => onChange(clamp(value - step))}
          className="h-14 w-14 rounded-full bg-black/5 text-3xl font-bold active:scale-90 dark:bg-white/10"
          aria-label="Decrease"
        >
          −
        </button>
        <div className="text-center">
          <div className="text-5xl font-extrabold tabular-nums">{value}</div>
          <div className="text-sm text-black/50 dark:text-white/50">{unit}</div>
        </div>
        <button
          onClick={() => onChange(clamp(value + step))}
          className="h-14 w-14 rounded-full bg-black/5 text-3xl font-bold active:scale-90 dark:bg-white/10"
          aria-label="Increase"
        >
          +
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-8 w-full accent-green-500"
      />
      <div className="mt-auto pt-8">
        <NextButton onClick={onNext} label={nextLabel} disabled={nextDisabled} />
      </div>
    </section>
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
      className="w-full rounded-2xl bg-green-500 px-6 py-4 text-lg font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-60"
    >
      {label}
    </button>
  );
}
