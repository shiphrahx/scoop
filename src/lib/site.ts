// Where Scoop lives, for absolute URLs in metadata (OpenGraph cards need them).
// The Vercel URL below is stable, so nothing has to be configured to get
// working link previews. Set NEXT_PUBLIC_SITE_URL when a custom domain lands.
const PRODUCTION_URL = "https://scoop-pink-one.vercel.app";

export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);

  return new URL(PRODUCTION_URL);
}
