"use client";

import { useEffect, useState } from "react";

// How much of the window has to disappear before we call it a keyboard. iOS
// shaves a few dozen pixels off the visual viewport for its own toolbars as you
// scroll, and that is not a keyboard.
const KEYBOARD_MIN_PX = 120;

// True while the on-screen keyboard is covering part of the window.
//
// The web has no keyboard event, so this reads the gap between the visual
// viewport (what you can actually see) and the layout viewport (what CSS lays
// out against). On iOS Safari those two come apart the moment the keyboard
// opens: CSS still believes the window runs the full height of the screen, so
// anything pinned to the bottom is pinned to a bottom the user can no longer
// see, and it ends up floating somewhere in the middle of the visible area.
//
// Returns false where `visualViewport` is missing and during SSR, so the caller
// renders its normal layout until proven otherwise.
export default function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const read = () => {
      // What the layout viewport claims exists below the visible area. With the
      // keyboard up that is roughly the keyboard's height; otherwise ~0.
      const hidden = window.innerHeight - viewport.height - viewport.offsetTop;
      setOpen(hidden > KEYBOARD_MIN_PX);
    };

    read();
    // Resize fires when the keyboard opens or closes; scroll fires when the
    // page is pushed up to keep the focused field in view, which moves
    // offsetTop without changing the height.
    viewport.addEventListener("resize", read);
    viewport.addEventListener("scroll", read);
    return () => {
      viewport.removeEventListener("resize", read);
      viewport.removeEventListener("scroll", read);
    };
  }, []);

  return open;
}
