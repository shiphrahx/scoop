"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Never re-fetch the route more than this often, however many messages the
// worker sends. A slow network is exactly when a refresh loop would hurt most.
const REFRESH_THROTTLE_MS = 15_000;

// Registers the service worker once, after the page loads, in production only
// (a SW in dev fights hot-reload). Renders nothing.
export default function ServiceWorkerRegister() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () =>
      navigator.serviceWorker.register("/sw.js").catch(() => {});

    // When the network was too slow, the worker serves the last-seen copy of
    // the page so something is on screen straight away, then says so once the
    // fresh response lands. Refreshing here re-fetches the route in place, so
    // the stale numbers correct themselves without the user reloading.
    let lastRefresh = 0;
    const onMessage = (event: MessageEvent) => {
      if (event.data !== "scoop:stale-served") return;
      const now = Date.now();
      if (now - lastRefresh < REFRESH_THROTTLE_MS) return;
      lastRefresh = now;
      router.refresh();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    // Registration waits for `load` so it never competes with the first paint.
    // But on a warm visit — everything served from cache — `load` can fire
    // before React hydrates, and a listener added after the event never runs:
    // the worker would then only install on some future slow page view. Check
    // readyState first so those visits register too.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
    }

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("load", register);
    };
  }, [router]);

  return null;
}
