"use client";

import { useState, useTransition } from "react";
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
    <section className="flex w-full flex-col gap-3 rounded-3xl border border-black/10 p-5 text-left dark:border-white/15">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">AI features</h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            connected
              ? "bg-green-500/15 text-green-600 dark:text-green-400"
              : "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50"
          }`}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      <p className="text-sm text-black/50 dark:text-white/50">
        Paste your own Anthropic API key to turn on grocery scanning, recipe
        import, and meal ideas. It's stored for your account and used only on the
        server.
      </p>

      {connected ? (
        <button
          onClick={() => startTransition(() => clearApiKey())}
          disabled={pending}
          className="rounded-2xl border-2 border-rose-400 px-4 py-3 font-bold text-rose-600 active:scale-95 disabled:opacity-50 dark:text-rose-400"
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
            className="rounded-2xl border-2 border-black/10 px-4 py-3 outline-none focus:border-green-500 dark:border-white/15 dark:bg-transparent"
          />
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button
            onClick={save}
            disabled={pending || !key.trim()}
            className="rounded-2xl bg-green-500 px-4 py-3 font-bold text-white active:scale-95 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save key"}
          </button>
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-center text-sm font-semibold text-green-600 dark:text-green-400"
          >
            Get a key →
          </a>
        </>
      )}
    </section>
  );
}
