import Link from "next/link";
import CopyrightYear from "@/components/CopyrightYear";

export const ISSUES_URL = "https://github.com/shiphrahx/scoop/issues/new";

// Shared footer for the public pages: legal links, contact, and the health
// disclaimer that has to sit next to any calorie number we hand out.
export default function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-6 py-10 text-sm text-[var(--muted)]">
      <div className="flex flex-col items-center gap-4 border-t border-[var(--border)] pt-8 sm:flex-row sm:justify-between">
        <p>
          Scoop, your portion coach. &copy; <CopyrightYear />
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/privacy" className="hover:text-[var(--foreground)]">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-[var(--foreground)]">
            Terms
          </Link>
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--foreground)]"
          >
            Contact
          </a>
        </nav>
      </div>
      <p className="mt-6 max-w-2xl text-xs">
        Scoop gives general nutrition guidance, not medical advice. It is not a
        substitute for a doctor or dietitian. Talk to a healthcare professional
        before changing how you eat, especially if you are pregnant, under 18,
        or managing a medical condition or eating disorder.
      </p>
    </footer>
  );
}
