// Healthy Hero 3D service worker — offline play. Versioned files (?v=2.0.0) are immutable per
// release, so they are served cache-first; everything else is network-first with a cache fallback.
const VERSION = '2.0.0';
const CACHE = `healthy-hero-v${VERSION}-3d`;
const V = `?v=${VERSION}`;
const MODULES = ['main', 'narrator', 'mission-plan', 'content', 'blueprints', 'models', 'rig', 'engine', 'effects', 'world', 'gates', 'run', 'island', 'stage', 'ui', 'audio', 'blueprint-render'];
const FONTS = ['baloo-2-latin-600-normal', 'baloo-2-latin-700-normal', 'baloo-2-latin-800-normal', 'nunito-latin-500-normal', 'nunito-latin-700-normal', 'nunito-latin-800-normal', 'nunito-latin-900-normal'];
const APP = [
  '/', '/index.html', `/styles.css${V}`, `/src/vendor/three.module.min.js${V}`,
  ...MODULES.map((m) => `/src/${m}.js${V}`),
  ...FONTS.map((f) => `/assets/fonts/${f}.woff2`),
  '/assets/icon.svg', '/manifest.webmanifest', '/.well-known/flexzonic-game.json',
  '/classic/', '/classic/index.html', `/classic/classic.css${V}`, `/classic/classic.js${V}`
];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const immutable = url.search.includes(V) || url.pathname.startsWith('/assets/fonts/');
  if (immutable) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  event.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match(url.pathname.startsWith('/classic') ? '/classic/index.html' : '/index.html') : undefined))));
});
