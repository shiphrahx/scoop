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
import { ChevronDown, Lock, Maximize2, Watch, X } from "lucide-react";

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

  // Every trigger starts closed, so the server and the first client render agree
  // on null and there's nothing to hydrate — by the time this is open there is a
  // document to portal into.
  if (!open || typeof document === "undefined") return null;

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

// A card at dashboard size: a headline the eye can read at a glance, with the
// full detail one tap away in a drawer. Two of these fit across a phone.
export function CompactCard({
  icon,
  title,
  detail,
  bodyInteractive = false,
  wide = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  // The full-size version of this insight. Without one the card is just a card.
  detail?: React.ReactNode;
  // Set when the compact body has its own controls: a button inside a button is
  // invalid markup and swallows the inner tap, so only the header opens.
  bodyInteractive?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const head = (
    <span className="flex w-full items-center gap-2 text-left">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--fill)] text-[var(--muted)]">
        {icon}
      </span>
      <span className="text-xs font-semibold leading-tight text-[var(--foreground)]">
        {title}
      </span>
      {detail ? (
        <Maximize2 size={14} className="ml-auto shrink-0 text-[var(--muted)]" />
      ) : null}
    </span>
  );

  return (
    <div className={`sc-card flex flex-col gap-3 p-4 ${wide ? "col-span-2" : ""}`}>
      {detail && !bodyInteractive ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex flex-col gap-3 text-left active:scale-[0.99]"
        >
          {head}
          <span className="flex flex-col gap-2">{children}</span>
        </button>
      ) : (
        <>
          {detail ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className="active:scale-[0.99]"
            >
              {head}
            </button>
          ) : (
            head
          )}
          <div className="flex flex-col gap-2">{children}</div>
        </>
      )}
      {detail ? (
        <Drawer open={open} onClose={() => setOpen(false)} title={title}>
          {detail}
        </Drawer>
      ) : null}
    </div>
  );
}

// What an insight needs before it has anything to say. Collected rather than
// rendered — see LockedLine.
export interface LockedInsight {
  title: string;
  why: string;
  // No wearable linked, so this one unlocks by connecting rather than by waiting.
  connect?: boolean;
}

// The cards for this section, two across on a phone, plus the one line that
// stands in for every card that isn't ready yet.
export function InsightGrid({
  locked = [],
  children,
}: {
  locked?: LockedInsight[];
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{children}</div>
      {locked.length > 0 ? <LockedLine items={locked} /> : null}
    </div>
  );
}

// Every not-yet-available insight in this section, folded into one line.
//
// These used to be full-height dashed cards, which meant a user in their first
// fortnight scrolled a screen of rectangles telling them to come back later. The
// reasons still matter, so they're a tap away rather than gone.
function LockedLine({ items }: { items: LockedInsight[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex items-center justify-center gap-1.5 py-1 text-xs text-[var(--muted)]"
      >
        <Lock size={12} />
        {items.length} more insight{items.length === 1 ? "" : "s"} unlock as you log
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Not ready yet">
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.title} className="rounded-2xl bg-[var(--fill-soft)] px-4 py-3">
              <p className="text-sm font-semibold">{i.title}</p>
              <p className="text-sm text-[var(--muted)]">{i.why}</p>
              {i.connect ? (
                <Link href="/me" className="sc-btn sc-btn-soft mt-2">
                  <Watch size={16} /> Connect a device
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}

// Something *inside* an open card has nothing to say yet — a measure with no
// readings, a board with no markers. A whole card in this state never renders;
// it goes in the locked line instead.
export function NeedsMoreData({ what }: { what: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-5 text-center">
      <p className="text-sm text-[var(--muted)]">Needs more data — {what}</p>
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
  size = "lg",
}: {
  value: string;
  unit?: string;
  label: string;
  tone?: "cool" | "good" | "warn";
  // "sm" is the dashboard-tile version — same figure, sized for half a phone.
  size?: "lg" | "sm";
}) {
  const tint =
    tone === "good"
      ? "var(--ink-green)"
      : tone === "warn"
        ? "var(--accent)"
        : "var(--foreground)";
  const small = size === "sm";
  return (
    <div>
      <p
        className={`font-semibold tabular-nums ${small ? "text-xl" : "text-3xl"}`}
        style={{ color: tint }}
      >
        {value}
        {unit ? (
          <span
            className={`ml-1 font-medium text-[var(--muted)] ${small ? "text-xs" : "text-base"}`}
          >
            {unit}
          </span>
        ) : null}
      </p>
      <p className={`text-[var(--muted)] ${small ? "text-xs leading-snug" : "text-sm"}`}>
        {label}
      </p>
    </div>
  );
}

// The numbers a user opens this page for, before any chart: two across on a
// phone, four on a desktop. Only tiles with a real number are ever passed in —
// an "—" placeholder would take the same space as an answer.
export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

export function KpiTile({
  label,
  value,
  unit,
  tone = "cool",
  detail,
  detailTitle,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "cool" | "good" | "warn";
  detail?: React.ReactNode;
  detailTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const tint =
    tone === "good"
      ? "var(--ink-green)"
      : tone === "warn"
        ? "var(--accent)"
        : "var(--foreground)";
  // A projected date is three words where a weight is three characters; shrink
  // rather than wrap to four lines in a half-width tile.
  const scale = value.length > 9 ? "text-sm" : value.length > 5 ? "text-lg" : "text-2xl";

  const inner = (
    <>
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      <span className={`font-semibold tabular-nums ${scale}`} style={{ color: tint }}>
        {value}
        {unit ? (
          <span className="ml-1 text-xs font-medium text-[var(--muted)]">{unit}</span>
        ) : null}
      </span>
    </>
  );

  return (
    <div className="sc-card flex flex-col p-4">
      {detail ? (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="flex flex-col items-start text-left active:scale-[0.99]"
          >
            {inner}
          </button>
          <Drawer
            open={open}
            onClose={() => setOpen(false)}
            title={detailTitle ?? label}
          >
            {detail}
          </Drawer>
        </>
      ) : (
        inner
      )}
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
