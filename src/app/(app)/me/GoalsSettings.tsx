"use client";

import { useState, useTransition } from "react";
import {
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
  Check,
  type LucideIcon,
} from "lucide-react";
import { saveGoals, type GoalsInput } from "./actions";
import type { ActivityLevel, DietType, GoalPace } from "@/lib/types";

type Option<T> = { value: T; label: string; icon: LucideIcon; desc?: string };

const DIET: Option<DietType>[] = [
  { value: "regular", label: "Everything", icon: Drumstick },
  { value: "vegetarian", label: "Vegetarian", icon: Salad },
  { value: "vegan", label: "Vegan", icon: Sprout },
];

const ACTIVITY: Option<ActivityLevel>[] = [
  { value: "sedentary", label: "Mostly sitting", icon: Armchair, desc: "Desk job, little or no exercise" },
  { value: "light", label: "Lightly active", icon: Footprints, desc: "Light exercise 1–3 days a week" },
  { value: "moderate", label: "Active", icon: Bike, desc: "Moderate exercise 3–5 days a week" },
  { value: "active", label: "Very active", icon: Dumbbell, desc: "Hard exercise 6–7 days a week" },
  { value: "very_active", label: "Athlete", icon: Trophy, desc: "Hard training twice a day or a physical job" },
];

const PACE: Option<GoalPace>[] = [
  { value: "gentle", label: "Gentle & steady", icon: Turtle, desc: "About 0.25 kg (½ lb) a week" },
  { value: "steady", label: "Standard", icon: Footprints, desc: "About 0.5 kg (1 lb) a week" },
  { value: "aggressive", label: "Push hard", icon: Flame, desc: "About 0.75 kg (1½ lb) a week" },
];

export default function GoalsSettings({ initial }: { initial: GoalsInput }) {
  const [diet, setDiet] = useState<DietType>(initial.diet_type);
  const [activity, setActivity] = useState<ActivityLevel>(initial.activity_level);
  const [pace, setPace] = useState<GoalPace>(initial.goal_pace);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    diet !== initial.diet_type ||
    activity !== initial.activity_level ||
    pace !== initial.goal_pace;

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveGoals({ diet_type: diet, activity_level: activity, goal_pace: pace });
      setSaved(true);
    });
  }

  return (
    <section className="flex w-full flex-col gap-4 sc-card p-5 text-left">
      <h2 className="text-lg font-semibold">Goals</h2>

      <Row<DietType> label="Diet" options={DIET} value={diet} onPick={(v) => { setDiet(v); setSaved(false); }} />
      <Row<ActivityLevel> label="Activity level" options={ACTIVITY} value={activity} onPick={(v) => { setActivity(v); setSaved(false); }} />
      <Row<GoalPace> label="Pace" options={PACE} value={pace} onPick={(v) => { setPace(v); setSaved(false); }} />

      <p className="text-xs text-[var(--muted)]">
        Saving recalculates your calorie + macro targets for this week.
      </p>
      <button
        onClick={save}
        disabled={pending || (!dirty && !saved)}
        className="sc-btn sc-btn-primary w-full py-3"
      >
        {pending ? (
          "Saving…"
        ) : saved && !dirty ? (
          <>
            <Check size={18} /> Saved
          </>
        ) : (
          "Save goals"
        )}
      </button>
    </section>
  );
}

function Row<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      <div className="flex flex-col gap-2">
        {options.map((o) => {
          const Icon = o.icon;
          const active = value === o.value;
          return (
            <button
              key={o.value}
              onClick={() => onPick(o.value)}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left font-semibold transition active:scale-[0.98] ${
                active ? "border-transparent" : "border-[var(--border)] bg-white/40"
              }`}
              style={active ? { background: "var(--tint-teal)" } : undefined}
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                  active ? "text-white" : "text-[var(--ink-teal)]"
                }`}
                style={{
                  background: active ? "var(--grad-primary)" : "var(--fill)",
                }}
              >
                <Icon size={20} />
              </span>
              <span className="flex flex-col">
                <span>{o.label}</span>
                {o.desc && (
                  <span className="text-sm font-normal text-[var(--muted)]">
                    {o.desc}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
