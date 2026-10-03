// Spaceflight Academy service worker — generated at build time by vite.config.ts.
// HTML and JSON are network-first (always fresh when online); hashed assets are cache-first.
const CACHE = "__CACHE_NAME__";
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(PRECACHE.map((path) => cache.add(path).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => caches.match(request).then((hit) => hit || caches.match(new URL(request.url).pathname.startsWith("/classic") ? "/classic/" : "/")));
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match("/")));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname === "/healthz") return;
  const fresh = request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/") || url.pathname.endsWith(".html") || url.pathname.endsWith(".json") || url.pathname.endsWith(".webmanifest");
  event.respondWith(fresh ? networkFirst(request) : cacheFirst(request));
});
