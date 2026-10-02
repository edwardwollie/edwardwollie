// Pages and data are network-first so new deployments reach players immediately;
// hashed build assets and static images are cache-first for fast, offline-capable reloads.
const CACHE = "dino-frontier-v3";
const CORE = ["/", "/manifest.webmanifest", "/icon.svg", "/og.png"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname === "/healthz") return;
  const store = response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return response;
  };
  const immutable = url.pathname.startsWith("/assets/") || /\.(svg|png|webmanifest|woff2?)$/.test(url.pathname);
  if (immutable) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(store)));
    return;
  }
  e.respondWith(fetch(e.request).then(store).catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === "navigate" ? caches.match("/") : Response.error()))));
});
