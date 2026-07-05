"use client";

import { useState } from "react";
import { applyReview, generateAppleToken, syncFitbit } from "./actions";

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
      className="w-full rounded-2xl bg-green-500 px-6 py-4 text-lg font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-60"
    >
      {saved
        ? "Set for next week ✓"
        : saving
          ? "Saving…"
          : changed
            ? "Use these new targets"
            : "Keep these targets"}
    </button>
  );
}

// Connect (link out to Fitbit) or pull the latest data.
export function FitbitButton({ connected }: { connected: boolean }) {
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!connected) {
    return (
      <a
        href="/api/fitbit/authorize"
        className="block w-full rounded-2xl bg-black/5 px-6 py-4 text-center text-lg font-bold active:scale-95 dark:bg-white/10"
      >
        Connect Fitbit
      </a>
    );
  }

  async function sync() {
    setSyncing(true);
    setMsg(null);
    try {
      await syncFitbit();
      setMsg("Synced ✓");
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
        className="w-full rounded-2xl bg-black/5 px-6 py-4 text-lg font-bold active:scale-95 disabled:opacity-60 dark:bg-white/10"
      >
        {syncing ? "Syncing…" : "Sync last 7 days"}
      </button>
      {msg && (
        <p className="text-center text-sm text-black/60 dark:text-white/60">
          {msg}
        </p>
      )}
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
        className="w-full rounded-2xl bg-black/5 px-6 py-4 text-lg font-bold active:scale-95 disabled:opacity-60 dark:bg-white/10"
      >
        {busy ? "Generating…" : "Set up Apple Watch"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-black/60 dark:text-white/60">
        In the Health Auto Export app, add a REST API automation that POSTs to
        this URL. Keep it secret.
      </p>
      <code className="block break-all rounded-2xl bg-black/5 p-3 text-xs dark:bg-white/10">
        {url}
      </code>
      <div className="flex gap-2">
        <button
          onClick={copy}
          className="flex-1 rounded-2xl bg-black/5 px-4 py-3 font-bold active:scale-95 dark:bg-white/10"
        >
          {copied ? "Copied ✓" : "Copy URL"}
        </button>
        <button
          onClick={make}
          disabled={busy}
          className="rounded-2xl bg-black/5 px-4 py-3 font-bold active:scale-95 disabled:opacity-60 dark:bg-white/10"
        >
          {busy ? "…" : "New token"}
        </button>
      </div>
    </div>
  );
}
