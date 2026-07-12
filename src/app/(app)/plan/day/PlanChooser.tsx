"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, PencilLine, ChevronRight } from "lucide-react";
import { planMyDay } from "./actions";

// The front door to planning a day: let the app do it all, or step through the
// guided "I know what I want" wizard. Sits above the editable plan.
export default function PlanChooser({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function planForMe() {
    setErr(null);
    setBusy(true);
    try {
      await planMyDay();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't plan your day.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={planForMe}
        disabled={busy || !connected}
        className="flex items-center gap-3 rounded-[1.75rem] p-5 text-left text-white transition active:scale-[0.99] disabled:opacity-60"
        style={{ background: "var(--grad-primary)", boxShadow: "var(--shadow-glow)" }}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/20">
          <Sparkles size={22} />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">
            {busy ? "Planning…" : "Plan the day for me"}
          </span>
          <span className="block truncate text-sm text-white/80">
            Fill every open meal from your pantry to hit today&apos;s macros
          </span>
        </span>
        <ChevronRight size={20} className="ml-auto shrink-0 text-white/80" />
      </button>

      <Link
        href="/plan/day/build"
        className="sc-card flex items-center gap-3 p-5 transition active:scale-[0.99]"
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
          style={{ background: "var(--tint-teal)", color: "var(--ink-teal)" }}
        >
          <PencilLine size={22} />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">I know what I want to eat</span>
          <span className="block truncate text-sm text-[var(--muted)]">
            Tell us your meals, then build the rest around a carb + protein
          </span>
        </span>
        <ChevronRight size={20} className="ml-auto shrink-0 text-[var(--muted)]" />
      </Link>

      {!connected && (
        <p className="text-center text-sm text-[var(--muted)]">
          Connect your AI key in Settings to plan from your pantry.
        </p>
      )}
      {err && (
        <p className="text-center text-sm font-medium text-[var(--danger,#e5484d)]">
          {err}
        </p>
      )}
    </div>
  );
}
