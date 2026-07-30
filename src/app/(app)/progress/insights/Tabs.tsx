"use client";

// The dashboard's four groups, one on screen at a time.
//
// A panel mounts the first time its tab is opened and then stays mounted, just
// hidden — so switching back doesn't rebuild a chart or lose a chip selection,
// but arriving on Progress doesn't pay for all four either. That mattered: the
// charts are Recharts-backed, and mounting every tab up front meant loading the
// library and laying out four tabs' worth of charts into hidden DOM before the
// one the user is actually looking at was interactive.

import { useId, useState } from "react";

export interface Tab {
  key: string;
  label: string;
  content: React.ReactNode;
}

export default function Tabs({ tabs }: { tabs: Tab[] }) {
  const base = useId();
  const [active, setActive] = useState(tabs[0]?.key);
  // Which panels have been opened at least once. Starts with the one on screen,
  // so the server render and the first client render agree.
  const [mounted, setMounted] = useState<string[]>(() =>
    tabs[0]?.key ? [tabs[0].key] : [],
  );

  const open = (key: string) => {
    setActive(key);
    setMounted((seen) => (seen.includes(key) ? seen : [...seen, key]));
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Progress sections"
        // Sticky so a long tab doesn't strand the user at the bottom with no
        // way back across without scrolling.
        className="sticky top-0 z-20 -mx-1 flex gap-1.5 overflow-x-auto rounded-full px-1 py-2 backdrop-blur-[var(--glass-blur)]"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${base}-tab-${t.key}`}
            aria-controls={`${base}-panel-${t.key}`}
            aria-selected={active === t.key}
            onClick={() => open(t.key)}
            className="sc-chip shrink-0 px-4 py-2 text-sm"
            data-active={active === t.key}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`${base}-panel-${t.key}`}
          aria-labelledby={`${base}-tab-${t.key}`}
          hidden={active !== t.key}
          // The attribute alone loses to a `flex` class — Tailwind's reset
          // matches [hidden] at zero specificity — so the class does the hiding
          // and the attribute stays for the accessibility tree.
          className={active === t.key ? "flex flex-col gap-5" : "hidden"}
        >
          {/* The panel element is always here so `aria-controls` above always
              points at something real; only its contents wait to be opened. */}
          {mounted.includes(t.key) ? t.content : null}
        </div>
      ))}
    </div>
  );
}
