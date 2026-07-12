import Image from "next/image";
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
  Flame,
  Gauge,
  Drumstick,
  Calculator,
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
          <Image
            src="/logos/icon.png"
            alt="Scoop"
            width={36}
            height={36}
            className="rounded-xl"
            priority
          />
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

      {/* ---------- The maths (trust) ---------- */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="text-center">
          <span className="sc-chip mb-5" data-active="true">
            <Calculator size={16} strokeWidth={2.5} />
            No black box
          </span>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            The maths, in plain words
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--muted)]">
            Every number Scoop gives you comes from a formula you can check — the
            same ones dietitians use. Here&rsquo;s exactly how we get yours.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {[
            {
              icon: Flame,
              title: "What you burn",
              body: "We start with the energy your body burns just staying alive, then account for how active you are — or your real burn from Fitbit or Apple Watch.",
              formula: "10 × kg + 6.25 × cm − 5 × age ± sex,  then × activity",
              note: "Tell us your body-fat % and we switch to a lean-mass formula for an even sharper number.",
            },
            {
              icon: Gauge,
              title: "Your daily target",
              body: "We take a gentle bite out of that burn — sized to the pace you chose. Never so big that it costs you muscle or energy.",
              formula: "burn − (your kg per week × 7700 ÷ 7)",
              note: "Capped at 1% of your bodyweight a week, and never below 1,500 kcal (men) or 1,200 (women).",
            },
            {
              icon: Drumstick,
              title: "Your macros",
              body: "Protein goes high to protect muscle while you lose. Fat is a quarter of your calories. Carbs fill the rest for energy.",
              formula: "protein ≈ 2 g per kg · fat = 25% · carbs = the rest",
              note: "Protein is measured against a healthy target weight, so it never overshoots.",
            },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="sc-card flex flex-col p-6">
                <span
                  className="grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] text-white"
                  style={{ background: "var(--grad-primary)" }}
                >
                  <Icon size={22} strokeWidth={2.2} />
                </span>
                <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-[var(--muted)]">{s.body}</p>
                <code className="mt-4 block rounded-[var(--radius-sm)] bg-[var(--fill-soft)] px-3 py-2 font-mono text-xs text-[var(--ink-teal)]">
                  {s.formula}
                </code>
                <p className="mt-3 text-sm text-[var(--muted)]">{s.note}</p>
              </div>
            );
          })}
        </div>

        {/* Worked example — real numbers so there's nothing to hide. */}
        <div className="sc-card-solid mt-6 p-6 md:p-8">
          <p className="text-sm font-semibold text-[var(--ink-teal)]">
            See it with real numbers
          </p>
          <p className="mt-1 text-[var(--muted)]">
            Someone 80 kg · 180 cm · 30 · lightly active, aiming for about ½ kg a
            week:
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-3 font-mono text-sm">
            <ExampleChip top="rests at" value="1,780" unit="kcal" />
            <Flow />
            <ExampleChip top="burns" value="2,448" unit="kcal/day" />
            <Flow />
            <ExampleChip top="eats" value="1,898" unit="kcal/day" strong />
            <Flow />
            <ExampleChip top="macros" value="160 P · 195 C · 53 F" unit="grams" />
          </div>
        </div>
      </section>

      {/* ---------- How the coach adjusts ---------- */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="sc-card p-8 md:p-10">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            A coach that changes its mind{" "}
            <span className="sc-grad-text">slowly</span>
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">
            Scoop watches your progress, but it only moves your targets when the
            numbers are real — so your plan never yo-yos on a bad day.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {[
              {
                title: "Trends, not days",
                body: "It reads your 7-day average weight, so a salty dinner or a heavy water day never moves your plan.",
              },
              {
                title: "Two weeks, minimum",
                body: "Your body needs time to respond. Scoop won't touch a target until it's had about two weeks to work.",
              },
              {
                title: "Only when you're consistent",
                body: "If you've barely weighed in, it waits for real data instead of guessing at a change.",
              },
              {
                title: "Small, honest nudges",
                body: "Stalled? A small trim. Losing too fast? A little back. Scale stuck but waist shrinking? It holds — and tells you that's fat loss the scale can't see.",
              },
            ].map((c) => (
              <div key={c.title} className="flex gap-3">
                <span
                  className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white"
                  style={{ background: "var(--grad-primary)" }}
                >
                  <Check size={14} strokeWidth={3} />
                </span>
                <div>
                  <h3 className="font-semibold">{c.title}</h3>
                  <p className="mt-0.5 text-[var(--muted)]">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
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

// One step in the worked-example flow.
function ExampleChip({
  top,
  value,
  unit,
  strong,
}: {
  top: string;
  value: string;
  unit: string;
  strong?: boolean;
}) {
  return (
    <span
      className="inline-flex flex-col rounded-[var(--radius-sm)] px-3 py-2"
      style={{
        background: strong ? "var(--tint-teal)" : "var(--fill-soft)",
      }}
    >
      <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
        {top}
      </span>
      <span
        className={`font-semibold ${strong ? "text-[var(--ink-teal)]" : ""}`}
      >
        {value}
      </span>
      <span className="text-[10px] text-[var(--muted)]">{unit}</span>
    </span>
  );
}

// The arrow between two example chips.
function Flow() {
  return (
    <ArrowRight
      size={18}
      strokeWidth={2.5}
      className="shrink-0 text-[var(--muted)]"
      aria-hidden
    />
  );
}
