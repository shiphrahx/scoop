import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { ISSUES_URL } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Scoop stores, who it is shared with, and how to get your data deleted.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="25 July 2026">
      <p>
        Scoop handles health data, so here is the whole picture in plain words:
        what we store, who else sees it, and how to get rid of it.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account.</strong> The email address Google gives us when
          you sign in.
        </li>
        <li>
          <strong>Your profile.</strong> Height, sex, birth year, diet type,
          allergies, dislikes, goal and pace — whatever you enter in onboarding
          and settings.
        </li>
        <li>
          <strong>Your logs.</strong> Weights, body measurements, food entries,
          pantry items, batches, recipes and favourites.
        </li>
        <li>
          <strong>Your activity.</strong> Steps, workout calories and sleep, but
          only if you connect a wearable or send data from Apple Health.
        </li>
        <li>
          <strong>Your Anthropic API key</strong>, if you add one. It is
          encrypted before it is stored and is only ever decrypted on the server
          to call Anthropic on your behalf. It is never sent to your browser.
        </li>
      </ul>

      <h2>What we don&rsquo;t do</h2>
      <p>
        No advertising. No selling or renting your data. No analytics or
        tracking scripts — the only cookies Scoop sets are the ones that keep
        you signed in. We do not use your data to train any model.
      </p>

      <h2>Who else touches your data</h2>
      <ul>
        <li>
          <strong>Supabase</strong> — stores the database and handles sign-in.
        </li>
        <li>
          <strong>Vercel</strong> — hosts the app and serves the pages.
        </li>
        <li>
          <strong>Google</strong> — sign-in, and the Google Health API if you
          choose to connect a wearable.
        </li>
        <li>
          <strong>Anthropic</strong> — only if you add your own API key. When
          you scan a grocery list, import a recipe or ask for meal ideas, the
          image or text and the relevant pantry and macro numbers are sent to
          Anthropic under <em>your</em> key, on your account with them.
        </li>
        <li>
          <strong>Open Food Facts</strong> — when you scan a barcode, the
          barcode is looked up against their public database.
        </li>
      </ul>
      <p>
        Nothing is shared with anyone else, except where the law requires it.
      </p>

      <h2>Wearables</h2>
      <p>
        Connecting a wearable is optional and you can disconnect it at any time
        from your settings. We request read access only, and we only read the
        activity and sleep figures the coach needs. Apple Watch data reaches us
        only if you set up Health Auto Export yourself and point it at your
        personal ingest link.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Your data stays until you ask us to delete it. Your history matters here
        — the coach reads trailing averages, so old weights and logs are what
        make it work.
      </p>

      <h2>Getting your data out, or deleted</h2>
      <p>
        Ask and we will delete your account and everything attached to it.{" "}
        <a href={ISSUES_URL} target="_blank" rel="noreferrer">
          Open an issue on GitHub
        </a>{" "}
        with the email address you signed up with. Issues are public, so
        don&rsquo;t put anything private in there — we will reply by email if we
        need more. The same route works for a copy of your data.
      </p>

      <h2>Children</h2>
      <p>
        Scoop is not for under-18s. Don&rsquo;t create an account if you are
        under 18.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a way that matters, the date at the top
        changes with it.
      </p>
    </LegalPage>
  );
}
