// Scoop service worker. Keeps the app openable offline: static assets are
// cached on first use, page navigations try the network first and fall back to
// the last-seen page (or Home) when offline. API/auth traffic is never cached.
// Bumped to v5: "/" now redirects signed-in visitors to their dashboard, and the
// activate handler drops every older cache, so a landing page stored before
// that, which would still be served to someone who has since signed in, goes
// with it.
const CACHE = "scoop-v5";

// How long a page navigation waits for the network before the last-seen copy of
// that same page is shown instead. Tapping the home-screen icon on mobile data
// used to sit on a blank screen for as long as the request took, long enough
// that the tap read as ignored and people tapped again. Past this point a
// slightly stale screen beats no screen; the network answer still lands, gets
// cached, and the page is told to refresh itself in place (see below).
const NAV_TIMEOUT_MS = 2000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Navigation Preload: let the browser start the page request in parallel
      // with the service worker booting up, instead of the fetch waiting behind
      // SW start-up. On a navigation that reaches the network anyway, this hands
      // back the tens of milliseconds the worker takes to spin up on mobile.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// The app tells us to wipe cached pages the moment the user signs out, so a
// stale authenticated page can never be served back from the offline fallback
// on a shared device.
self.addEventListener("message", (event) => {
  if (event.data === "clear-cache") {
    event.waitUntil(caches.delete(CACHE));
  }
});

// Only a clean 200 from our own origin is worth keeping, never a redirect (the
// auth bounce to /login, or "/" sending a signed-in visitor to their dashboard)
// or an error (a 404 during a deploy), or we would serve that bad page back
// later and the route would look broken.
//
// `redirected` is the part that matters for a followed redirect: it arrives as a
// perfectly ordinary ok/basic response for the URL it ended up at, so the status
// alone does not tell it apart. Storing one under the requested URL would pin a
// user's auth state into the cache, the dashboard served for "/" long after
// they signed out, and a redirected response may not be returned to a
// navigation at all.
const cacheable = (res) => res && res.ok && res.type === "basic" && !res.redirected;

// Tell every open page that what it is looking at came from cache and fresher
// HTML has since arrived, so it can pull the new data in without a reload.
async function announceStale() {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) client.postMessage("scoop:stale-served");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/auth")) return;

  // Immutable build assets + icons: cache-first.
  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons")
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Page navigations: network-first, but never open-ended. The network race is
  // given NAV_TIMEOUT_MS; past that, a cached copy of this page is shown at once
  // and the in-flight request keeps going in the background to refresh it.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);

        // One shared promise for the network attempt: whether it wins the race
        // or lands after the timeout, the same response updates the cache.
        let servedFromCache = false;
        const network = (async () => {
          const res = (await event.preloadResponse) || (await fetch(req));
          if (cacheable(res)) await cache.put(req, res.clone());
          // If the user is already looking at the stale copy, nudge the page to
          // pull the fresh data rather than leaving them on old numbers.
          if (servedFromCache) await announceStale();
          return res;
        })();
        // The background path must outlive this fetch handler, and an unhandled
        // rejection here would surface as an SW error.
        event.waitUntil(network.catch(() => {}));

        const cached = await cache.match(req);

        // Nothing cached for this page: the network is the only answer there is,
        // so wait it out and fall back to any shell we have if it fails.
        if (!cached) {
          try {
            return await network;
          } catch {
            return (await cache.match("/")) || Response.error();
          }
        }

        // Cached copy in hand, give the network a bounded head start.
        const timeout = new Promise((resolve) =>
          setTimeout(() => resolve(null), NAV_TIMEOUT_MS),
        );
        const winner = await Promise.race([
          network.catch(() => null),
          timeout,
        ]);
        if (winner) return winner;

        servedFromCache = true;
        return cached;
      })(),
    );
  }
});
