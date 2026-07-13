// A tiny in-memory sliding-window rate limiter. Best-effort only: on serverless
// each instance keeps its own counters, so this caps abuse per warm instance
// rather than globally. It exists to stop a single signed-in user from hammering
// the URL importer (which makes outbound fetches) in a tight loop — not as a
// hard security boundary. Swap for a Redis/Upstash limiter if we ever need one
// that holds across instances.

const hits = new Map<string, number[]>();

// Record one hit for `key` and report whether it stays within `max` hits per
// `windowMs`. Returns true when allowed, false when the limit is exceeded.
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map doesn't grow unbounded across many keys.
  if (hits.size > 1000) {
    for (const [k, times] of hits) {
      if (times.every((t) => t <= cutoff)) hits.delete(k);
    }
  }

  return recent.length <= max;
}
