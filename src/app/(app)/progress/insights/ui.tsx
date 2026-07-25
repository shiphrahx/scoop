"use client";

// The shared furniture every insight card is built from.
//
// Each card on the dashboard has four possible states and they are all
// first-class here: it has data, it needs more history, it needs a device, or it
// failed. Giving them one implementation is what stops the dashboard degrading
// into a wall of empty rectangles for a user in their first fortnight.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Watch, X } from "lucide-react";

// A card's detail, opened over the dashboard rather than inline.
//
// Bottom sheet on a phone (thumb reaches the top of it), centred panel from
// sm up. Portalled to the body: the trigger lives inside a card that scales on
// press, and a transformed ancestor would make `fixed` mean "inside that card".
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Freeze the page behind the sheet, or a flick on the sheet scrolls the
    // dashboard and the user loses their place on close.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--scrim)]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-solid)] shadow-[var(--shadow-soft)] backdrop-blur-[var(--glass-blur)] sm:max-w-xl sm:rounded-[var(--radius-lg)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] text-[var(--muted)] active:scale-90"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function InsightCard({
  icon,
  title,
  aside,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="sc-card flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--fill)] text-[var(--muted)]">
          {icon}
        </span>
        <span className="text-sm font-semibold text-[var(--foreground)]">{title}</span>
        {aside ? <span className="ml-auto">{aside}</span> : null}
      </div>
      {children}
    </div>
  );
}

// The card has nothing to say yet and says so, with what would unlock it.
export function NeedsMoreData({ what }: { what: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-5 text-center">
      <p className="text-sm text-[var(--muted)]">Needs more data — {what}</p>
    </div>
  );
}

// No wearable linked, so there is nothing to plot and never will be until one is.
export function ConnectPrompt({ what }: { what: string }) {
  return (
    <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
      <Watch size={22} className="text-[var(--muted)]" />
      <p className="text-sm text-[var(--muted)]">
        Connect a device to see {what}.
      </p>
      <Link href="/me" className="sc-btn sc-btn-soft mt-1">
        Connect a device
      </Link>
    </div>
  );
}

// Stamped on every correlation card. These are one person's weekly numbers next
// to each other — a real pattern is worth knowing and is still not a cause, and
// the card should never let a user forget which one they're looking at.
export function PatternNote({ weeks }: { weeks: number }) {
  return (
    <p className="text-xs text-[var(--muted)]">
      Patterns, not proof — {weeks} week{weeks === 1 ? "" : "s"} compared.
    </p>
  );
}

// A big number with its label. The one thing on a card the eye should land on.
export function Hero({
  value,
  unit,
  label,
  tone = "cool",
}: {
  value: string;
  unit?: string;
  label: string;
  tone?: "cool" | "good" | "warn";
}) {
  const tint =
    tone === "good"
      ? "var(--ink-green)"
      : tone === "warn"
        ? "var(--accent)"
        : "var(--foreground)";
  return (
    <div>
      <p className="text-3xl font-semibold tabular-nums" style={{ color: tint }}>
        {value}
        {unit ? (
          <span className="ml-1 text-base font-medium text-[var(--muted)]">{unit}</span>
        ) : null}
      </p>
      <p className="text-sm text-[var(--muted)]">{label}</p>
    </div>
  );
}

// A row of small figures under a chart or hero.
export function StatRow({
  stats,
}: {
  stats: { label: string; value: string; tone?: "good" | "warn" }[];
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-[var(--border)] pt-3">
      {stats.map((s) => (
        <div key={s.label}>
          <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            {s.label}
          </p>
          <p
            className="text-sm font-semibold tabular-nums"
            style={{
              color:
                s.tone === "good"
                  ? "var(--ink-green)"
                  : s.tone === "warn"
                    ? "var(--accent)"
                    : "var(--foreground)",
            }}
          >
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// Detail that would crowd a phone screen, folded away behind a tap.
export function Expandable({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-[var(--border)] pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-sm text-[var(--muted)]"
      >
        {label}
        <ChevronDown
          size={16}
          className="transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

// Rounds for display. Everything the user reads goes through here or a toFixed —
// a raw 0.6999999999999993 kg is the fastest way to look like a spreadsheet.
export function fmt(value: number, dp = 1): string {
  return value.toFixed(dp);
}

export function signed(value: number, dp = 1): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(dp)}`;
}
