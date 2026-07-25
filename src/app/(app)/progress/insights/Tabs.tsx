"use client";

// The dashboard's four groups, one on screen at a time.
//
// Every panel stays mounted and the inactive ones are hidden, so the content is
// in the DOM whatever the tab state does, and switching back doesn't rebuild a
// chart or lose a chip selection.

import { useId, useState } from "react";

export interface Tab {
  key: string;
  label: string;
  content: React.ReactNode;
}

export default function Tabs({ tabs }: { tabs: Tab[] }) {
  const base = useId();
  const [active, setActive] = useState(tabs[0]?.key);

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
            onClick={() => setActive(t.key)}
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
          {t.content}
        </div>
      ))}
    </div>
  );
}
