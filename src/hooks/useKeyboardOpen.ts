"use client";

import { useEffect, useState } from "react";

// How much of the window has to disappear before we call it a keyboard. iOS
// shaves a few dozen pixels off the visual viewport for its own toolbars as you
// scroll, and that is not a keyboard.
const KEYBOARD_MIN_PX = 120;

// Input types that don't summon a keyboard. Everything else does, including
// date and time, whose wheels cover the bottom of the screen exactly the way a
// keyboard does.
const NO_KEYBOARD = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

// Is this element one you type into?
function takesTyping(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  if (el instanceof HTMLInputElement) return !NO_KEYBOARD.has(el.type);
  return false;
}

// Touch device? A physical keyboard doesn't cover anything, so the focus signal
// below only applies where the keyboard is drawn on the glass.
function onGlass(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

// True while the on-screen keyboard is covering part of the window.
//
// Two signals, because neither is enough on its own.
//
// The first is the gap between the visual viewport (what you can actually see)
// and the layout viewport (what CSS lays out against). On iOS Safari those two
// come apart the moment the keyboard opens: CSS still believes the window runs
// the full height of the screen, so anything pinned to the bottom is pinned to
// a bottom the user can no longer see, and it ends up floating somewhere in the
// middle of the visible area.
//
// The second is whether something you can type into has focus. The viewport
// gap alone missed the case this hook was written for: installed to the home
// screen, iOS runs the app standalone, and there the keyboard doesn't always
// move the visual viewport at all. It just slides up over the page, so the
// numbers say nothing has happened while the bottom of the screen is gone. A
// focused text field is the plainer fact, and on a touch device it means the
// keyboard is up.
//
// Returns false during SSR and on a machine with a real keyboard, so the caller
// renders its normal layout until proven otherwise.
export default function useKeyboardOpen(): boolean {
  const [shrunk, setShrunk] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const read = () => {
      // What the layout viewport claims exists below the visible area. With the
      // keyboard up that is roughly the keyboard's height; otherwise ~0.
      const hidden = window.innerHeight - viewport.height - viewport.offsetTop;
      setShrunk(hidden > KEYBOARD_MIN_PX);
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

  useEffect(() => {
    if (!onGlass()) return;

    const read = () => setTyping(takesTyping(document.activeElement));

    // focusout lands before the next field has focus, so reading straight away
    // would say "nothing focused" every time you tab from one input to the
    // next, and the nav would blink back in mid-typing. Let the move finish.
    let pending: ReturnType<typeof setTimeout> | undefined;
    const readAfterTheMove = () => {
      clearTimeout(pending);
      pending = setTimeout(read, 0);
    };

    read();
    // focusin/focusout rather than focus/blur: those two don't bubble, and the
    // fields are all over the tree.
    document.addEventListener("focusin", read);
    document.addEventListener("focusout", readAfterTheMove);
    return () => {
      clearTimeout(pending);
      document.removeEventListener("focusin", read);
      document.removeEventListener("focusout", readAfterTheMove);
    };
  }, []);

  return shrunk || typing;
}
