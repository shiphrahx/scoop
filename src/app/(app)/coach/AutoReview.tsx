"use client";

import { useEffect, useRef } from "react";
import { ensureReviewApplied } from "./actions";

// Advances the weekly review on app open — but only for weeks the review would
// HOLD (no macro change). A review that would CHANGE the target is left as a
// proposal for the user to apply from the Coach screen: the app never moves
// someone's macros without them choosing to.
//
// Auto-writing the held weeks still matters: it keeps the run of weekly rows the
// review counts back through unbroken (miss them and the coach sits at "settling
// in" forever), and it does so without changing anyone's food. The server action
// is idempotent, so mounting this anywhere the user lands is enough. Renders
// nothing.
const STAMP_KEY = "scoop:last-review-check";

export default function AutoReview() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // once per mount, incl. React 18 double-effect
    ran.current = true;

    // The review only ever changes on a new local day (a week can't roll over
    // within one), so checking more than once a day just fires a heavy server
    // scan on every home open for nothing. Skip if today's check already
    // succeeded; a failed one leaves no stamp, so it retries on the next open.
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(STAMP_KEY) === today) return;
    } catch {
      // No localStorage (private mode / blocked) — fall through and just run it.
    }

    // Best effort: a failure here should never break the page the user came for.
    void ensureReviewApplied()
      .then(() => {
        try {
          localStorage.setItem(STAMP_KEY, today);
        } catch {}
      })
      .catch(() => {});
  }, []);

  return null;
}
