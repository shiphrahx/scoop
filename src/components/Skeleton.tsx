// Placeholder shapes for the moment between a tap and the server answering.
//
// Nothing here is decoration: without a loading boundary the App Router paints
// NOTHING on a navigation until the whole page has rendered on the server, so a
// phone on mobile data just looks frozen. These give the tap an answer, and they
// let Next prefetch the route's shell ahead of time.
//
// The pulse is CSS-only and honours prefers-reduced-motion globally.

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-sm)] bg-[var(--fill)] ${className}`}
    />
  );
}

// A card-shaped placeholder, sized like the cards it stands in for.
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`sc-card flex flex-col gap-3 p-4 ${className}`}>
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-7 w-7 rounded-lg" />
        <SkeletonBlock className="h-3 w-24" />
      </div>
      <SkeletonBlock className="h-7 w-20" />
      <SkeletonBlock className="h-3 w-full" />
    </div>
  );
}

// The page title every screen opens with.
export function SkeletonTitle() {
  return <SkeletonBlock className="h-8 w-40" />;
}
