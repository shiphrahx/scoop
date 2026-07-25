// Where Scoop lives, for absolute URLs in metadata (OpenGraph cards need them).
// Set NEXT_PUBLIC_SITE_URL to the custom domain; otherwise we fall back to the
// Vercel deployment URL, then to localhost in development.
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return new URL(`https://${vercel}`);

  return new URL("http://localhost:3000");
}
