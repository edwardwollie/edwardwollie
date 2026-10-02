// Neon Sports Arena 2.0 service worker.
// Pages are network-first so a new release is picked up on the next visit;
// hashed build assets and textures are cache-first; the blueprint PDF, GLB
// models and plates are never cached (they are large, optional downloads).
const CACHE = "neon-sports-v3";
const CORE = ["/", "/manifest.webmanifest", "/icon.svg", "/og.png"];
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => undefined)); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/blueprints/") || url.pathname === "/healthz" || url.pathname.startsWith("/.well-known/")) return;
  const page = e.request.mode === "navigate" || (e.request.headers.get("accept") || "").includes("text/html");
  if (page) {
    e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); return res; }).catch(() => caches.match("/")));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/blueprint-textures/") || /\.(svg|png|webmanifest)$/.test(url.pathname))) {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  })));
});
