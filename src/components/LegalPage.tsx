import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";

// Shell for the plain-text legal pages. Same furniture as the landing page so
// they don't feel bolted on, and readable at a phone width.
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logos/icon.png"
            alt=""
            width={32}
            height={32}
            className="rounded-xl"
          />
          <span className="text-lg font-semibold tracking-tight">Scoop</span>
        </Link>
        <Link href="/" className="sc-btn sc-btn-neutral text-sm">
          <ArrowLeft size={16} strokeWidth={2.5} />
          Back
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16 pt-6">
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Last updated {updated}</p>
        <div className="sc-legal mt-10">{children}</div>
      </main>

      <SiteFooter />
    </>
  );
}
