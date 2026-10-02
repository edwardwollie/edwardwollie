const CACHE_NAME = "neon-dominion-v3.0.0";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=3.0.0",
  "/manifest.webmanifest",
  "/assets/icon.svg",
  "/app/audio.js",
  "/app/game.js",
  "/app/main.js",
  "/app/render3d.js",
  "/app/hangar.js",
  "/app/blueprints/kit.js",
  "/app/blueprints/models.js",
  "/app/blueprints/rigs.js",
  "/app/blueprints/views.js",
  "/app/vendor/three.js",
  "/version.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(request, cacheKey = request) {
  return fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
      }
      return response;
    })
    .catch(() => caches.match(cacheKey));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname === "/healthz" ||
    url.pathname === "/.well-known/flexzonic-game.json"
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/index.html"));
    return;
  }

  // Code and data: always prefer the network so a release never mixes old and new modules.
  if (/\.(?:js|css|json|webmanifest)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Images, models and the blueprint atlas: cache first, they are versioned by release.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response.ok || response.type !== "basic") return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});
