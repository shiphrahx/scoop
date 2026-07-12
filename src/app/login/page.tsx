"use client";

import Image from "next/image";
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
        <Image
          src="/logos/icon.png"
          alt="Scoop"
          width={96}
          height={96}
          className="rounded-[2rem]"
          style={{ boxShadow: "var(--shadow-glow)" }}
          priority
        />
        <h1 className="mt-2 text-5xl font-semibold tracking-tight">Scoop</h1>
        <p className="max-w-xs text-lg text-[var(--muted)]">
          Your portion coach. We tell you what to eat to hit your macros.
        </p>
      </div>

      <button
        onClick={signInWithGoogle}
        disabled={loading}
        className="sc-btn sc-btn-primary w-full max-w-xs py-4 text-lg"
      >
        {loading ? "Opening Google…" : "Continue with Google"}
      </button>
    </main>
  );
}
