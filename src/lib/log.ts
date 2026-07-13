// One place to record a server-side error we would otherwise swallow. Writes to
// stderr, which Vercel captures in its function logs — so a failed background
// sync or write is diagnosable instead of vanishing into an empty catch block.
// Deliberately tiny; swap for a real logger (Sentry, etc.) here if we ever add one.
export function logError(context: string, err: unknown): void {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(`[scoop] ${context}: ${message}`);
}
