"use client";

import { useEffect, useRef } from "react";
import { ensureReviewApplied } from "./actions";

// Advances the weekly review on app open.
//
// The adaptive loop used to depend on the user finding the Coach page and
// pressing "use these new targets". Miss a week and the target for that week
// was never written, which broke the run of weekly rows the review counts back
// through to decide how long a target has been in force — so the coach would
// sit at "settling in" indefinitely.
//
// The server action is idempotent, so mounting this anywhere the user lands is
// enough to keep the chain unbroken. Renders nothing.
export default function AutoReview() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // once per mount, incl. React 18 double-effect
    ran.current = true;
    // Best effort: a failure here should never break the page the user came for.
    void ensureReviewApplied().catch(() => {});
  }, []);

  return null;
}
