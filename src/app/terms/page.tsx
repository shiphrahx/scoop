import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { ISSUES_URL } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms you agree to by using Scoop.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="25 July 2026">
      <p>Using Scoop means agreeing to this. It is short on purpose.</p>

      <h2>Not medical advice</h2>
      <p>
        Scoop works out calorie and macro targets from standard formulas and the
        numbers you give it. That is general nutrition guidance, not medical
        advice, and it is not a substitute for a doctor or a dietitian. Talk to
        a healthcare professional before changing how you eat, especially if
        you are pregnant, breastfeeding, under 18, or managing a medical
        condition or an eating disorder. If a target ever looks wrong for you,
        trust the professional, not the app.
      </p>

      <h2>The numbers are estimates</h2>
      <p>
        Formula-based energy estimates carry real error, food labels are
        approximate, barcode data comes from a public database that anyone can
        edit, and wearable calorie figures are themselves estimates. Scoop is a
        guide, not a measurement.
      </p>

      <h2>Your account</h2>
      <p>
        You need a Google account to sign in. Keep it secure. Anything done
        with your account is treated as done by you. Use Scoop for yourself, and
        don&rsquo;t use it to break the law or to attack the service.
      </p>

      <h2>Free, and no guarantees</h2>
      <p>
        Scoop is free and provided as-is, with no warranty. It may break, lose
        data, or go away. Keep your own record of anything you can&rsquo;t
        afford to lose. To the extent the law allows, we are not liable for any
        loss that comes from using it.
      </p>

      <h2>Ending it</h2>
      <p>
        Stop using Scoop whenever you like and ask us to delete your account:{" "}
        <a href={ISSUES_URL} target="_blank" rel="noreferrer">
          open an issue on GitHub
        </a>
        . We may suspend accounts that abuse the service.
      </p>

      <h2>Changes</h2>
      <p>
        These terms can change. The date at the top says when they last did.
      </p>
    </LegalPage>
  );
}
