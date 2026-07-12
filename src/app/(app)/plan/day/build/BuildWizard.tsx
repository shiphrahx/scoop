"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Wheat,
  Drumstick,
} from "lucide-react";
import type { MealSuggestion } from "@/lib/types";
import {
  saveKnownMeals,
  suggestAround,
  assignSuggestion,
  planMyDay,
} from "../actions";

type Step = "known" | "carb" | "protein" | "suggest" | "done";
const STEP_ORDER: Step[] = ["known", "carb", "protein", "suggest", "done"];

// The guided "I know what I want to eat" pipeline. One decision per screen:
// type the meals you already know → pick a base carb → pick a protein → get a
// dish for each open slot → let the app fill anything still empty.
export default function BuildWizard({
  slots,
  filled,
  carbs,
  proteins,
  connected,
}: {
  slots: string[];
  filled: string[];
  carbs: string[];
  proteins: string[];
  // Typing a meal in words needs the AI macro estimate (bring-your-own-key);
  // the carb/protein/suggest steps are all local pantry maths.
  connected: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("known");
  const [filledSet, setFilledSet] = useState<Set<string>>(new Set(filled));
  const [known, setKnown] = useState<Record<string, string>>({});
  const [carb, setCarb] = useState<string | null>(null);
  const [protein, setProtein] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const emptySlots = useMemo(
    () => slots.filter((s) => !filledSet.has(s)),
    [slots, filledSet],
  );

  const stepIndex = STEP_ORDER.indexOf(step);
  const go = (s: Step) => {
    setErr(null);
    setNote(null);
    setStep(s);
  };

  async function run(fn: () => Promise<void>) {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // Step 1 → estimate + fix the typed meals, then move on to building the rest.
  async function submitKnown() {
    const entries = Object.entries(known)
      .map(([slot, text]) => ({ slot, text: text.trim() }))
      .filter((e) => e.text);
    await run(async () => {
      if (connected && entries.length) {
        await saveKnownMeals(entries);
        setFilledSet((prev) => {
          const next = new Set(prev);
          for (const e of entries) next.add(e.slot);
          return next;
        });
      }
      go("carb");
    });
  }

  async function fetchSuggestions() {
    await run(async () => {
      const found = await suggestAround(carb, protein);
      setSuggestions(found);
      setNote(
        found.length ? null : "No dishes fit right now — try a different pick.",
      );
    });
  }

  async function assign(slot: string, meal: MealSuggestion) {
    await run(async () => {
      await assignSuggestion(slot, meal);
      setFilledSet((prev) => new Set(prev).add(slot));
      setSuggestions(null);
      // Everything planned now? Wrap up. Otherwise offer another dish.
      go(slots.every((s) => filledSet.has(s) || s === slot) ? "done" : "suggest");
    });
  }

  async function finish() {
    await run(async () => {
      if (emptySlots.length) await planMyDay();
      router.push("/plan/day");
    });
  }

  return (
    <section className="flex flex-col gap-5">
      <StepDots total={STEP_ORDER.length} active={stepIndex} />

      {err && (
        <p className="text-center text-sm font-medium text-[var(--danger,#e5484d)]">
          {err}
        </p>
      )}

      {/* Step 1 — meals you already know */}
      {step === "known" && (
        <div className="flex flex-col gap-4">
          <StepHeading
            title="Anything you already know you want?"
            sub="Type a meal for any slot — we'll size the rest of the day around it. Leave the ones you're unsure about blank."
          />
          {!connected ? (
            <p className="sc-card p-4 text-sm text-[var(--muted)]">
              Typing a meal in words needs an AI key (Settings) to estimate its
              macros. Skip this and build from your pantry below — no key needed.
            </p>
          ) : emptySlots.length === 0 ? (
            <p className="sc-card p-4 text-sm text-[var(--muted)]">
              Every meal is already planned. Jump ahead to fill or tweak.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {emptySlots.map((slot) => (
                <li key={slot} className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {slot}
                  </label>
                  <input
                    value={known[slot] ?? ""}
                    onChange={(e) =>
                      setKnown((k) => ({ ...k, [slot]: e.target.value }))
                    }
                    placeholder="e.g. porridge with banana"
                    className="sc-input w-full"
                  />
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={submitKnown}
            disabled={busy}
            className="sc-btn sc-btn-primary py-4 text-lg"
          >
            {busy ? "Saving…" : "Continue"} <ArrowRight size={20} />
          </button>
        </div>
      )}

      {/* Step 2 — base carb */}
      {step === "carb" && (
        <ChoiceStep
          icon={<Wheat size={20} />}
          title="Pick a base carb"
          sub="From what's in your pantry. This is the base of the dish we'll build."
          options={carbs}
          empty="No base carbs found in your pantry. Add some, or skip."
          selected={carb}
          onSelect={setCarb}
          onBack={() => go("known")}
          onNext={() => go("protein")}
          busy={busy}
        />
      )}

      {/* Step 3 — protein */}
      {step === "protein" && (
        <ChoiceStep
          icon={<Drumstick size={20} />}
          title="Pick a protein"
          sub="From your pantry, to match the carb."
          options={proteins}
          empty="No proteins found in your pantry. Add some, or skip."
          selected={protein}
          onSelect={setProtein}
          onBack={() => go("carb")}
          onNext={() => {
            setSuggestions(null);
            go("suggest");
            void fetchSuggestions();
          }}
          busy={busy}
        />
      )}

      {/* Step 4 — dishes to assign */}
      {step === "suggest" && (
        <div className="flex flex-col gap-4">
          <StepHeading
            title="Here's what fits"
            sub={
              [carb, protein].filter(Boolean).join(" + ") ||
              "Built from your pantry and today's macros."
            }
          />
          {busy && !suggestions && (
            <p className="text-center text-sm text-[var(--muted)]">
              Thinking up dishes…
            </p>
          )}
          {note && (
            <p className="text-center text-sm font-medium text-[var(--muted)]">
              {note}
            </p>
          )}
          {suggestions?.map((m, i) => (
            <SuggestionCard
              key={i}
              meal={m}
              slots={emptySlots}
              busy={busy}
              onAssign={(slot) => assign(slot, m)}
            />
          ))}
          <div className="flex gap-2">
            <button
              onClick={() => go("protein")}
              disabled={busy}
              className="sc-btn sc-btn-neutral flex-1"
            >
              <ArrowLeft size={18} /> Back
            </button>
            <button
              onClick={fetchSuggestions}
              disabled={busy}
              className="sc-btn sc-btn-soft flex-1"
            >
              <Sparkles size={18} /> {suggestions ? "New ideas" : "Suggest"}
            </button>
          </div>
          <button
            onClick={() => go("done")}
            disabled={busy}
            className="text-sm text-[var(--muted)] underline"
          >
            Skip — just fill the rest for me
          </button>
        </div>
      )}

      {/* Step 5 — fill the rest */}
      {step === "done" && (
        <div className="flex flex-col gap-4">
          <StepHeading
            title={emptySlots.length ? "Fill the rest?" : "You're all set"}
            sub={
              emptySlots.length
                ? `${emptySlots.length} meal${emptySlots.length > 1 ? "s" : ""} still open — I'll build ${emptySlots.length > 1 ? "them" : "it"} from your pantry to hit today's macros.`
                : "Every meal is planned. Take a look at your day."
            }
          />
          <button
            onClick={finish}
            disabled={busy}
            className="sc-btn sc-btn-primary py-4 text-lg"
          >
            <Sparkles size={22} />
            {busy
              ? "Finishing…"
              : emptySlots.length
                ? "Fill the rest & view my day"
                : "View my day"}
          </button>
        </div>
      )}
    </section>
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
            background:
              i <= active ? "var(--ink-teal)" : "var(--fill)",
          }}
        />
      ))}
    </div>
  );
}

function StepHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-semibold">{title}</h2>
      {sub && <p className="text-sm text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

// A pick-one-tile step with Back / Next (Next works even with nothing picked —
// the carb and protein are optional hints).
function ChoiceStep({
  icon,
  title,
  sub,
  options,
  empty,
  selected,
  onSelect,
  onBack,
  onNext,
  busy,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  options: string[];
  empty: string;
  selected: string | null;
  onSelect: (v: string | null) => void;
  onBack: () => void;
  onNext: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl"
          style={{ background: "var(--tint-teal)", color: "var(--ink-teal)" }}
        >
          {icon}
        </span>
        <StepHeading title={title} sub={sub} />
      </div>

      {options.length === 0 ? (
        <p className="sc-card p-4 text-sm text-[var(--muted)]">{empty}</p>
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

      <div className="flex gap-2">
        <button
          onClick={onBack}
          disabled={busy}
          className="sc-btn sc-btn-neutral flex-1"
        >
          <ArrowLeft size={18} /> Back
        </button>
        <button
          onClick={onNext}
          disabled={busy}
          className="sc-btn sc-btn-primary flex-1"
        >
          {selected ? "Next" : "Skip"} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

function SuggestionCard({
  meal,
  slots,
  busy,
  onAssign,
}: {
  meal: MealSuggestion;
  slots: string[];
  busy: boolean;
  onAssign: (slot: string) => void;
}) {
  const [slot, setSlot] = useState<string | null>(slots[0] ?? null);
  return (
    <div className="flex flex-col gap-2 sc-card p-4">
      <p className="text-lg font-semibold">{meal.name}</p>
      <p className="text-sm text-[var(--muted)]">{meal.why}</p>

      {meal.portions.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-2xl bg-[var(--fill-soft)] p-3 text-sm">
          {meal.portions.map((p, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {Math.round(p.grams)} g
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--muted)]">
        {Math.round(meal.kcal)} kcal · P{Math.round(meal.protein_g)} C
        {Math.round(meal.carbs_g)} F{Math.round(meal.fat_g)}
      </p>

      {slots.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {slots.map((s) => (
            <button
              key={s}
              onClick={() => setSlot(s)}
              data-active={slot === s}
              className="sc-chip text-sm"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => slot && onAssign(slot)}
        disabled={busy || !slot}
        className="sc-btn sc-btn-soft mt-1"
      >
        <Check size={16} />
        {slot ? `Add to ${slot}` : "No open slot"}
      </button>
    </div>
  );
}
