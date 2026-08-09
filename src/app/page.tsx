import Image from "next/image";
import Link from "next/link";
import { Geist_Mono } from "next/font/google";
import {
  ArrowRight,
  Watch,
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
import type { Metadata } from "next";
import InstallAppButton from "@/components/InstallAppButton";
import SiteFooter from "@/components/SiteFooter";
import AppPreview from "@/components/AppPreview";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// The worked example below is the only monospaced text in the product, so the
// face loads here rather than in the root layout, the signed-in screens should
// not preload a font they never draw with. Applied per element (the two spots
// that use `font-mono`) so nothing has to wrap the page in an extra div.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Public front door, for people who are not signed in yet.
//
// Anyone with a session is sent to /dashboard before this ever renders; the proxy
// does it (see lib/supabase/middleware.ts), because only there can an expired
// token be refreshed. So this page has no user to branch on, reads no cookies,
// and stays fully static.
export default async function LandingPage() {
  // Signed-out visitors only, so the call to action is always the same.
  const primaryHref = "/login";
  const primaryLabel = "Get started free";

  return (
    <>
      {/* ---------- Header ---------- */}
      {/* Sticky so the way in is always one tap away on a long page. */}
      <header className="sticky top-0 z-40 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logos/icon.png"
              alt="Scoop"
              width={32}
              height={32}
              className="rounded-xl"
            />
            <span className="text-lg font-semibold tracking-tight">Scoop</span>
          </div>

          {/* Room for the section links only once there is room. */}
          <nav
            aria-label="Sections"
            className="hidden items-center gap-6 text-sm text-[var(--muted)] md:flex"
          >
            <a href="#how" className="hover:text-[var(--foreground)]">
              How it works
            </a>
            <a href="#maths" className="hover:text-[var(--foreground)]">
              The maths
            </a>
            <a href="#coach" className="hover:text-[var(--foreground)]">
              The coach
            </a>
            <a href="#features" className="hover:text-[var(--foreground)]">
              Features
            </a>
          </nav>

          <Link href={primaryHref} className="sc-btn sc-btn-primary text-sm">
            Get started
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* ---------- Hero ---------- */}
        <section
          aria-labelledby="hero-title"
          className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-20 pt-10 text-center lg:pt-16"
        >
          <span className="sc-chip mb-6" data-active="true">
            <Sparkles size={16} strokeWidth={2.5} />
            Your portion coach
          </span>

          <h1
            id="hero-title"
            className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
          >
            Scoop tells you the{" "}
            <span className="sc-grad-text">portion to eat.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg text-[var(--muted)] sm:text-xl">
            Instead of searching for what you ate, Scoop reads your body data
            and gives you the portion that hits today&rsquo;s macros. Mostly
            tapping, almost no typing.
          </p>

          <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Link
              href={primaryHref}
              className="sc-btn sc-btn-primary px-7 py-4 text-lg"
            >
              {primaryLabel}
              <ArrowRight size={20} strokeWidth={2.5} />
            </Link>
            {/* Only appears on phones/browsers that can actually install. */}
            <InstallAppButton />
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">
            Free. Google sign-in. No card. Installs to your home screen.
          </p>

          {/* The actual Home screen, rendered from the app's own components. */}
          <div className="mt-16 flex w-full justify-center">
            <AppPreview />
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section
          id="how"
          aria-labelledby="how-title"
          className="mx-auto w-full max-w-6xl px-6 py-16"
        >
          <h2
            id="how-title"
            className="text-center text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            How it works
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
                body: "Barcode, receipt, or a typed list. Scoop learns what you actually have on hand.",
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
                    <span className="sc-icon-tile">
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
        <section
          id="maths"
          aria-labelledby="maths-title"
          className="mx-auto w-full max-w-6xl px-6 py-16"
        >
          <div className="text-center">
            <span className="sc-chip mb-5" data-active="true">
              <Calculator size={16} strokeWidth={2.5} />
              Open formulas
            </span>
            <h2
              id="maths-title"
              className="text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              The maths, in plain words
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--muted)]">
              Every number Scoop gives you comes from a formula you can check —
              the same ones dietitians use. Here&rsquo;s exactly how we get
              yours.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {[
              {
                icon: Flame,
                title: "What you burn",
                body: "We start with the energy your body burns just staying alive, then account for how active you are — or your real burn from Fitbit or Apple Watch.",
                formula:
                  "10 × kg + 6.25 × cm − 5 × age ± sex,  then × activity",
                note: "Tell us your body-fat % and we switch to a lean-mass formula for a more accurate figure.",
              },
              {
                icon: Gauge,
                title: "Your daily target",
                body: "We subtract a deficit from that burn, sized to the pace you chose. Never large enough to cost you muscle or energy.",
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
                  <span className="sc-icon-tile">
                    <Icon size={22} strokeWidth={2.2} />
                  </span>
                  <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[var(--muted)]">{s.body}</p>
                  <code
                    className={`${geistMono.variable} mt-4 block rounded-[var(--radius-sm)] bg-[var(--fill-soft)] px-3 py-2 font-mono text-xs text-[var(--ink-teal)]`}
                  >
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
              Someone 80 kg · 180 cm · 30 · lightly active, aiming for about ½
              kg a week:
            </p>
            <div
              className={`${geistMono.variable} mt-5 flex flex-wrap items-center gap-x-2 gap-y-3 font-mono text-sm`}
            >
              <ExampleChip top="rests at" value="1,780" unit="kcal" />
              <Flow />
              <ExampleChip top="burns" value="2,448" unit="kcal/day" />
              <Flow />
              <ExampleChip top="eats" value="1,898" unit="kcal/day" strong />
              <Flow />
              <ExampleChip
                top="macros"
                value="160 P · 195 C · 53 F"
                unit="grams"
              />
            </div>
          </div>
        </section>

        {/* ---------- How the coach adjusts ---------- */}
        <section
          id="coach"
          aria-labelledby="coach-title"
          className="mx-auto w-full max-w-6xl px-6 py-16"
        >
          <div className="sc-card p-8 md:p-10">
            <h2
              id="coach-title"
              className="text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              A coach that changes your targets{" "}
              <span className="sc-grad-text">slowly</span>
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">
              Scoop tracks your progress, but only moves your targets when the
              data supports it, so your plan doesn&rsquo;t swing on a single bad
              day.
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
                  title: "Small, measured adjustments",
                  body: "Stalled: a small trim. Losing too fast: a little added back. Scale flat but waist down: targets hold, because that's fat loss the scale doesn't show.",
                },
              ].map((c) => (
                <div key={c.title} className="flex gap-3">
                  <span className="sc-icon-dot mt-1">
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
        <section
          id="features"
          aria-labelledby="features-title"
          className="mx-auto w-full max-w-6xl px-6 py-16"
        >
          <h2
            id="features-title"
            className="text-center text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            What it does in the background
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {[
              {
                icon: Watch,
                title: "Your watch does the counting",
                body: "Connect a Fitbit or Google-Health wearable, or send Apple Watch data across. Steps, workouts and sleep feed straight into today's target.",
              },
              {
                icon: Sparkles,
                title: "Plan from your pantry",
                body: "Suggestions use only what you own and fit your diet — vegetarian, vegan, allergies and all.",
              },
              {
                icon: LineChart,
                title: "A coach that adjusts",
                body: "A weekly review of weight, measurements and activity adjusts your macros from your real results.",
              },
              {
                icon: Check,
                title: "Batch cooking that counts",
                body: "Log the packs and total cooked weight once. Scoop tracks macros per gram across the whole week.",
              },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="sc-card-solid flex gap-4 p-6">
                  <span className="sc-icon-tile-soft">
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
        <section
          aria-labelledby="cta-title"
          className="mx-auto w-full max-w-6xl px-6 py-16"
        >
          <div className="sc-grad-panel overflow-hidden px-8 py-14 text-center">
            <h2
              id="cta-title"
              className="text-3xl font-semibold tracking-tight text-white sm:text-4xl"
            >
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
      </main>

      <SiteFooter />
    </>
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
