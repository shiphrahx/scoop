// Scoop service worker. Keeps the app openable offline: static assets are
// cached on first use, page navigations try the network first and fall back to
// the last-seen page (or Home) when offline. API/auth traffic is never cached.
const CACHE = "scoop-v3";

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

  // Page navigations: network-first, fall back to cache when offline. Only a
  // clean 200 is cached — never a redirect (auth bounce to /login) or an error
  // (a 404 during a dev recompile), or the SW would serve that stale bad page
  // back on the next offline/failed fetch and the route would look broken.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Prefer the preloaded response if navigation preload gave us one.
          const res = (await event.preloadResponse) || (await fetch(req));
          if (res.ok && res.type === "basic") {
            const cache = await caches.open(CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(req)) ||
            (await cache.match("/")) ||
            Response.error()
          );
        }
      })(),
    );
  }
});
