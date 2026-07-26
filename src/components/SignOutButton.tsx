"use client";

import { LogOut } from "lucide-react";

// Posts to the sign-out route handler, which clears the session server-side.
// Before the post navigates away, tell the service worker to drop its cached
// pages so the just-signed-in view can't be served back from the offline
// fallback to whoever opens the app next.
export default function SignOutButton() {
  function clearCache() {
    navigator.serviceWorker?.controller?.postMessage("clear-cache");
  }

  return (
    <form action="/auth/signout" method="post" onSubmit={clearCache}>
      <button
        type="submit"
        className="sc-btn sc-btn-neutral text-sm text-[var(--muted)]"
      >
        <LogOut size={16} />
        Sign out
      </button>
    </form>
  );
}
