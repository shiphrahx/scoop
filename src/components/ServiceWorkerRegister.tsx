"use client";

import { useEffect } from "react";

// Registers the service worker once, after the page loads, in production only
// (a SW in dev fights hot-reload). Renders nothing.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () =>
      navigator.serviceWorker.register("/sw.js").catch(() => {});

    // Registration waits for `load` so it never competes with the first paint.
    // But on a warm visit — everything served from cache — `load` can fire
    // before React hydrates, and a listener added after the event never runs:
    // the worker would then only install on some future slow page view. Check
    // readyState first so those visits register too.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
