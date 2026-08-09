"use client";

import { useLinkStatus } from "next/link";

// Instant tap feedback for nav links. `useLinkStatus` reports whether the
// enclosing <Link>'s navigation is in flight, on a slow phone the destination
// is a dynamic route whose skeleton may not have prefetched yet, so without
// this a tap looks like nothing happened until the server answers.
//
// The dot starts invisible and only fades in after a short delay (see the
// `.sc-link-hint` rule in globals.css), so fast navigations never flash it,
// the hint appears only when the trip is actually slow enough to need it.
export default function LinkHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className="sc-link-hint" data-pending={pending || undefined} />;
}
