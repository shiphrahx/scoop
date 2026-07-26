"use client";

// The current year for the footer's copyright line. Reading `new Date()` in a
// Server Component is disallowed under Cache Components (it's non-deterministic,
// so it can't be part of a prerendered static shell). A Client Component is the
// sanctioned place for "now" — it renders with the build year in the static
// HTML and settles on the viewer's year after hydration.
export default function CopyrightYear() {
  return <>{new Date().getFullYear()}</>;
}
