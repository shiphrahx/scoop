"use client";

// Loads the desktop home only on a desktop.
//
// `hidden lg:flex` hides the markup but not the cost: the phone still downloaded
// the Recharts bundle behind the three dashboard charts, hydrated them, and gave
// each one a ResizeObserver — all for elements it would never show. On an iPhone
// that is the slowest part of opening Home. Gating the import on the media query
// means a phone never asks for that chunk at all.
//
// Desktop pays a frame of skeleton for it, which is the right way round for a
// mobile-first app.

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type DesktopDashboardType from "./DesktopDashboard";

const DesktopDashboard = dynamic(() => import("./DesktopDashboard"), {
  ssr: false,
  loading: () => (
    <main className="hidden flex-1 flex-col gap-6 px-6 py-8 lg:flex">
      <div className="h-40 animate-pulse rounded-[var(--radius)] bg-[var(--fill)]" />
      <div className="h-64 animate-pulse rounded-[var(--radius)] bg-[var(--fill)]" />
    </main>
  ),
});

const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

// Server snapshot is false: the phone is the default, and a desktop resolves it
// on the first client render.
function useIsDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

export default function DesktopDashboardMount(
  props: ComponentProps<typeof DesktopDashboardType>,
) {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return null;
  return <DesktopDashboard {...props} />;
}
