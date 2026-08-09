"use client";

// Loads the desktop home only on a desktop.
//
// `hidden lg:flex` hides the markup but not the cost: the phone still downloaded
// the Recharts bundle behind the three dashboard charts, hydrated them, and gave
// each one a ResizeObserver, all for elements it would never show. On an iPhone
// that is the slowest part of opening Home. Gating the import on the media query
// means a phone never asks for that chunk at all.
//
// Desktop pays a frame of skeleton for it, which is the right way round for a
// mobile-first app.
//
// This is also where the server learns the viewport. The width is written to a
// cookie so the NEXT request can skip fetching the chart data on a phone
// entirely (see src/lib/viewport.ts), the client is the only side that knows.

import { useEffect, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import type DesktopDashboardType from "./DesktopDashboard";
import {
  DESKTOP_MIN_WIDTH_PX,
  NARROW,
  VIEWPORT_COOKIE,
  WIDE,
} from "@/lib/viewport";

const DesktopDashboard = dynamic(() => import("./DesktopDashboard"), {
  ssr: false,
  loading: () => (
    <main className="hidden flex-1 flex-col gap-6 px-6 py-8 lg:flex">
      <div className="h-40 animate-pulse rounded-[var(--radius)] bg-[var(--fill)]" />
      <div className="h-64 animate-pulse rounded-[var(--radius)] bg-[var(--fill)]" />
    </main>
  ),
});

const QUERY = `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`;
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30;

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

export default function DesktopDashboardMount({
  dataDeferred,
  ...props
}: ComponentProps<typeof DesktopDashboardType> & {
  // True when the server trusted the cookie, decided this was a phone, and did
  // not fetch the chart series. The data props are empty in that case.
  dataDeferred?: boolean;
}) {
  const isDesktop = useIsDesktop();
  const router = useRouter();

  useEffect(() => {
    const value = isDesktop ? WIDE : NARROW;
    document.cookie = `${VIEWPORT_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE_S}; SameSite=Lax`;

    // The hint said phone but this is a desktop, a resized window, a rotated
    // tablet, or a shared cookie jar. The series props are empty, so re-fetch
    // the route rather than draw blank charts. The cookie is already corrected
    // above, so the refresh comes back with the data.
    if (isDesktop && dataDeferred) router.refresh();
  }, [isDesktop, dataDeferred, router]);

  if (!isDesktop) return null;
  return <DesktopDashboard {...props} />;
}
