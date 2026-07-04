"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setLoading(false);
      alert(error.message);
    }
    // On success the browser is redirected to Google, so no further work here.
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="text-6xl" aria-hidden>
          🍦
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight">Scoop</h1>
        <p className="max-w-xs text-lg text-black/60 dark:text-white/60">
          Your portion coach. We tell you what to eat to hit your macros.
        </p>
      </div>

      <button
        onClick={signInWithGoogle}
        disabled={loading}
        className="flex w-full max-w-xs items-center justify-center gap-3 rounded-2xl bg-green-500 px-6 py-4 text-lg font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-60"
      >
        {loading ? "Opening Google…" : "Continue with Google"}
      </button>
    </main>
  );
}
