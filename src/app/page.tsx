import Link from "next/link";
import {
  ArrowRight,
  ScanLine,
  Sparkles,
  ChefHat,
  LineChart,
  Target,
  Package,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";

// Public front door. Everyone lands here; signing in sends them to /dashboard.
export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-in visitors get a shortcut straight into the app.
  const primaryHref = user ? "/dashboard" : "/login";
  const primaryLabel = user ? "Go to dashboard" : "Get started free";

  return (
    <main className="flex flex-1 flex-col">
      {/* ---------- Header ---------- */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-white"
            style={{ background: "var(--grad-primary)" }}
          >
            <span className="text-lg font-bold">S</span>
          </span>
          <span className="text-xl font-semibold tracking-tight">Scoop</span>
        </div>
        <Link
          href={primaryHref}
          className="sc-btn sc-btn-neutral text-sm"
        >
          {user ? "Dashboard" : "Log in"}
        </Link>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-20 pt-10 text-center lg:pt-16">
        <span className="sc-chip mb-6" data-active="true">
          <Sparkles size={16} strokeWidth={2.5} />
          Your portion coach
        </span>

        <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
          Stop counting.
          <br />
          We tell you the{" "}
          <span className="sc-grad-text">portion to eat.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg text-[var(--muted)] sm:text-xl">
          Scoop flips food tracking around. Instead of hunting for what you
          ate, it reads your body data and hands you the exact scoop to hit
          today&rsquo;s macros. Mostly tapping, almost no typing.
        </p>

        <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            href={primaryHref}
            className="sc-btn sc-btn-primary px-7 py-4 text-lg"
          >
            {primaryLabel}
            <ArrowRight size={20} strokeWidth={2.5} />
          </Link>
          <span className="text-sm text-[var(--muted)]">
            Free. Google sign-in. No card.
          </span>
        </div>

        {/* Floating stat preview — a taste of the app surface. */}
        <div className="mt-16 w-full max-w-md">
          <div className="sc-card p-6 text-left">
            <p className="text-sm font-medium text-[var(--muted)]">
              Left to eat today
            </p>
            <div className="mt-1 flex items-end gap-2">
              <span className="sc-grad-text text-5xl font-bold">820</span>
              <span className="mb-1.5 text-lg text-[var(--muted)]">kcal</span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { label: "Protein", value: "64 g" },
                { label: "Carbs", value: "72 g" },
                { label: "Fat", value: "21 g" },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-[var(--radius-sm)] bg-[var(--fill-soft)] p-3"
                >
                  <p className="text-xs text-[var(--muted)]">{m.label}</p>
                  <p className="mt-0.5 text-lg font-semibold">{m.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Three taps, not a food diary
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Target,
              step: "1",
              title: "Set your goal",
              body: "Diet, allergies, height, weight. We do the Mifflin–St Jeor math and set your daily macros.",
            },
            {
              icon: Package,
              step: "2",
              title: "Scan your pantry",
              body: "Barcode, receipt, or a grocery screenshot. Scoop learns what you actually have on hand.",
            },
            {
              icon: ChefHat,
              step: "3",
              title: "Eat your scoop",
              body: "Pick a carb, pick a protein. Scoop suggests the dish and the grams that fit what's left.",
            },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.step} className="sc-card p-6">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] text-white"
                    style={{ background: "var(--grad-primary)" }}
                  >
                    <Icon size={22} strokeWidth={2.2} />
                  </span>
                  <span className="text-sm font-semibold text-[var(--ink-teal)]">
                    Step {s.step}
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-[var(--muted)]">{s.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              icon: ScanLine,
              title: "Scan, don't type",
              body: "Barcodes via your camera, labels and receipts read by AI. Your usual meals live one tap away.",
            },
            {
              icon: Sparkles,
              title: "Plan from your pantry",
              body: "Suggestions use only what you own and fit your diet — vegetarian, vegan, allergies and all.",
            },
            {
              icon: LineChart,
              title: "A coach that adjusts",
              body: "Weekly review of weight, measurements and activity nudges your macros on real results, not guesses.",
            },
            {
              icon: Check,
              title: "Batch cooking that counts",
              body: "Log the packs and total cooked weight once. Scoop tracks macros per gram across the whole week.",
            },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="sc-card-solid flex gap-4 p-6"
              >
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-sm)]"
                  style={{
                    background: "var(--tint-teal)",
                    color: "var(--ink-teal)",
                  }}
                >
                  <Icon size={22} strokeWidth={2.2} />
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-1 text-[var(--muted)]">{f.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div
          className="sc-card overflow-hidden px-8 py-14 text-center"
          style={{
            background: "var(--grad-primary)",
            boxShadow: "var(--shadow-glow)",
          }}
        >
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Know your next scoop
          </h2>
          <p className="mx-auto mt-3 max-w-md text-lg text-white/85">
            Sign in with Google and get your first day of targets in under a
            minute.
          </p>
          <Link
            href={primaryHref}
            className="sc-btn mt-8 bg-white px-7 py-4 text-lg text-[var(--ink-teal)]"
          >
            {primaryLabel}
            <ArrowRight size={20} strokeWidth={2.5} />
          </Link>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="mx-auto w-full max-w-6xl px-6 py-10 text-center text-sm text-[var(--muted)]">
        Scoop — your portion coach.
      </footer>
    </main>
  );
}
