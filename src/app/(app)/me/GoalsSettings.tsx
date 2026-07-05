"use client";

import { useState, useTransition } from "react";
import { saveGoals, type GoalsInput } from "./actions";
import type { ActivityLevel, DietType, GoalPace } from "@/lib/types";

const DIET: { value: DietType; label: string; icon: string }[] = [
  { value: "regular", label: "Everything", icon: "🍗" },
  { value: "vegetarian", label: "Vegetarian", icon: "🥦" },
  { value: "vegan", label: "Vegan", icon: "🌱" },
];

const ACTIVITY: { value: ActivityLevel; label: string; icon: string }[] = [
  { value: "sedentary", label: "Mostly sitting", icon: "🪑" },
  { value: "light", label: "Lightly active", icon: "🚶" },
  { value: "moderate", label: "Active", icon: "🏃" },
  { value: "active", label: "Very active", icon: "💪" },
  { value: "very_active", label: "Athlete", icon: "🏆" },
];

const PACE: { value: GoalPace; label: string; icon: string }[] = [
  { value: "gentle", label: "Gentle (~0.25 kg/wk)", icon: "🐢" },
  { value: "steady", label: "Standard (~0.5 kg/wk)", icon: "🚶" },
  { value: "aggressive", label: "Push hard (~0.75 kg/wk)", icon: "🔥" },
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
      <h2 className="text-lg font-extrabold">Goals</h2>

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
        {pending ? "Saving…" : saved && !dirty ? "Saved ✓" : "Save goals"}
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
  options: { value: T; label: string; icon: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-extrabold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onPick(o.value)}
            className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left font-bold transition active:scale-[0.98] ${
              value === o.value
                ? "border-green-500 bg-green-500/10"
                : "border-[var(--border)]"
            }`}
          >
            <span className="text-xl">{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
