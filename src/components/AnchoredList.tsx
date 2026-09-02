"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

// Gap between the input and the list, and the smallest list worth showing
// below the input before it's better off flipped above it.
const GAP_PX = 4;
const MIN_BELOW_PX = 160;

// A dropdown that renders into <body> instead of next to its input.
//
// Both food search boxes sit inside a `.sc-card`, and a card carries
// `backdrop-filter` for the frosted look. A backdrop-filter that isn't `none`
// opens a new stacking context, so a z-index set anywhere inside the card is
// only ever compared against that card's own descendants. The bottom nav lives
// outside it at z-10, and the card itself paints at z-auto, underneath. That's
// why raising the results list to z-20 didn't lift it over the nav: it was
// never in the same race. Portalling to the body puts the list in the root
// stacking context, where its z-index means what it says.
//
// Fixed positioning also gets it out of the card's overflow and off the
// document scroll, so it can size itself to the space the keyboard leaves
// rather than running underneath it.
export default function AnchoredList({
  anchor,
  className,
  children,
}: {
  // The input the list hangs off.
  anchor: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}) {
  const [box, setBox] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = anchor.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      // Fixed positioning and getBoundingClientRect both work off the layout
      // viewport, and on iOS the keyboard doesn't shrink that. The visible
      // window is the visual viewport, so ask that where the floor is.
      const viewport = window.visualViewport;
      const visibleTop = viewport?.offsetTop ?? 0;
      const visibleBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;

      const below = visibleBottom - rect.bottom - GAP_PX * 2;
      const above = rect.top - visibleTop - GAP_PX * 2;

      // Below the input by default. Above it only when the keyboard has left
      // so little room underneath that the results would be a sliver, and
      // there is genuinely more room the other way.
      if (below < MIN_BELOW_PX && above > below) {
        setBox({
          left: rect.left,
          width: rect.width,
          bottom: window.innerHeight - rect.top + GAP_PX,
          maxHeight: above,
        });
        return;
      }

      setBox({
        left: rect.left,
        width: rect.width,
        top: rect.bottom + GAP_PX,
        maxHeight: Math.max(below, MIN_BELOW_PX),
      });
    };

    // Next frame rather than right now: the list has only just been asked for,
    // so let the browser settle the layout before reading the input's box.
    const frame = requestAnimationFrame(measure);

    // `true` for the capture phase: the page scrolls inside whichever ancestor
    // happens to be scrollable, and scroll doesn't bubble.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    // iOS moves the page around to keep the focused field above the keyboard,
    // which changes where the input is without firing a window scroll.
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
    };
  }, [anchor]);

  // Nothing to draw until the first measure, which also keeps this off the
  // server, where there's no body to portal into.
  if (!box) return null;

  return createPortal(
    <ul
      className={className}
      style={{
        position: "fixed",
        left: box.left,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        maxHeight: box.maxHeight,
        overflowY: "auto",
        zIndex: 60,
      }}
    >
      {children}
    </ul>,
    document.body,
  );
}
