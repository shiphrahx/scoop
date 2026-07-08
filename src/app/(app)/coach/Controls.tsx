"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  applyReview,
  clearMockActivity,
  generateAppleToken,
  seedSampleData,
  syncFitbit,
} from "./actions";

// Save the reviewed target as next week's plan.
export function ApplyTargetsButton({ changed }: { changed: boolean }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function apply() {
    setSaving(true);
    try {
      await applyReview();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      onClick={apply}
      disabled={saving || saved}
      className="sc-btn sc-btn-primary w-full py-4 text-lg"
    >
      {saved ? (
        <>
          <Check size={18} /> Set for next week
        </>
      ) : saving ? (
        "Saving…"
      ) : changed ? (
        "Use these new targets"
      ) : (
        "Keep these targets"
      )}
    </button>
  );
}

// Connect (link out to Fitbit) or pull the latest data.
export function FitbitButton({ connected }: { connected: boolean }) {
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!connected) {
    return (
      <a href="/api/fitbit/authorize" className="sc-btn sc-btn-soft w-full py-4 text-lg">
        Connect Fitbit
      </a>
    );
  }

  async function sync() {
    setSyncing(true);
    setMsg(null);
    try {
      await syncFitbit();
      setMsg("Synced");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={sync}
        disabled={syncing}
        className="sc-btn sc-btn-neutral w-full py-4 text-lg"
      >
        {syncing ? "Syncing…" : "Sync last 7 days"}
      </button>
      {msg && (
        <p className="text-center text-sm text-[var(--muted)]">
          {msg}
        </p>
      )}
    </div>
  );
}

// Stand-in for the Fitbit/Apple integrations while they aren't wired up:
// fills two weeks of activity + a weight trend so the Coach is usable.
export function DevSeed() {
  const [busy, setBusy] = useState<"seed" | "clear" | null>(null);

  const run = (which: "seed" | "clear", fn: () => Promise<void>) => async () => {
    setBusy(which);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] p-3">
      <p className="text-xs text-[var(--muted)]">
        Dev only — no Fitbit/Apple yet. Fill sample data to try the Coach.
      </p>
      <div className="flex gap-2">
        <button
          onClick={run("seed", seedSampleData)}
          disabled={busy !== null}
          className="sc-btn sc-btn-neutral flex-1 py-3 text-sm"
        >
          {busy === "seed" ? "Filling…" : "Add sample data"}
        </button>
        <button
          onClick={run("clear", clearMockActivity)}
          disabled={busy !== null}
          className="sc-btn sc-btn-neutral py-3 text-sm"
        >
          {busy === "clear" ? "…" : "Clear"}
        </button>
      </div>
    </div>
  );
}

// Show (and let the user copy) the URL Health Auto Export should post to.
export function AppleIngest({ initialToken }: { initialToken: string | null }) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const url =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/api/ingest/apple?token=${token}`
      : null;

  async function make() {
    setBusy(true);
    try {
      setToken(await generateAppleToken());
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!url) {
    return (
      <button
        onClick={make}
        disabled={busy}
        className="sc-btn sc-btn-neutral w-full py-4 text-lg"
      >
        {busy ? "Generating…" : "Set up Apple Watch"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-[var(--muted)]">
        In the <span className="font-semibold">Health Auto Export</span> app
        (iPhone), add an automation that POSTs to this URL. Keep it secret.
      </p>
      <ol className="ml-4 list-decimal text-sm text-[var(--muted)] marker:text-[var(--muted)]">
        <li>Automations → add a new REST API automation.</li>
        <li>
          Metrics: <span className="font-medium">Steps</span>,{" "}
          <span className="font-medium">Active Energy</span>,{" "}
          <span className="font-medium">Sleep Analysis</span>.
        </li>
        <li>Format JSON, aggregate daily, run once a day.</li>
        <li>Paste the URL below as the endpoint.</li>
      </ol>
      <code className="block break-all rounded-2xl bg-[var(--fill)] p-3 text-xs">
        {url}
      </code>
      <div className="flex gap-2">
        <button onClick={copy} className="sc-btn sc-btn-neutral flex-1 py-3">
          {copied ? "Copied" : "Copy URL"}
        </button>
        <button
          onClick={make}
          disabled={busy}
          className="sc-btn sc-btn-neutral py-3"
        >
          {busy ? "…" : "New token"}
        </button>
      </div>
    </div>
  );
}
