"use client";

import { useState, useTransition } from "react";
import { KeyRound, ExternalLink } from "lucide-react";
import { clearApiKey, saveApiKey } from "./actions";

// Bring-your-own-key: the user pastes their Anthropic key to turn on the AI
// features (grocery scan, recipe import, meal ideas). We only ever tell the
// client whether a key is set, never the key itself.
export default function ApiKeySettings({ connected }: { connected: boolean }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await saveApiKey(key);
        setKey("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the key.");
      }
    });
  }

  return (
    <section className="flex w-full flex-col gap-3 sc-card p-5 text-left">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl"
            style={{ background: "rgba(20,184,166,0.12)", color: "#0f766e" }}
          >
            <KeyRound size={18} />
          </span>
          <h2 className="text-lg font-semibold">AI features</h2>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={
            connected
              ? { background: "rgba(34,197,94,0.15)", color: "#15803d" }
              : { background: "rgba(15,23,42,0.06)", color: "var(--muted)" }
          }
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      <p className="text-sm text-[var(--muted)]">
        Paste your own Anthropic API key to turn on grocery scanning, recipe
        import, and meal ideas. It&apos;s stored for your account and used only
        on the server.
      </p>

      {connected ? (
        <button
          onClick={() => startTransition(() => clearApiKey())}
          disabled={pending}
          className="sc-btn border border-rose-300 font-semibold text-rose-600 active:scale-95 disabled:opacity-50"
        >
          {pending ? "Removing…" : "Remove key"}
        </button>
      ) : (
        <>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
            className="sc-input"
          />
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button
            onClick={save}
            disabled={pending || !key.trim()}
            className="sc-btn sc-btn-primary"
          >
            {pending ? "Saving…" : "Save key"}
          </button>
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 text-center text-sm font-semibold"
            style={{ color: "#0f766e" }}
          >
            Get a key <ExternalLink size={14} />
          </a>
        </>
      )}
    </section>
  );
}
