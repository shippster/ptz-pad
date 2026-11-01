/*
 * PTZ Pad service worker.
 * Makes the web version installable and lets it open with no internet.
 * App files: network first (so updates show up on the next launch), falling back
 * to the saved copy after 3 seconds or when offline. Fonts: saved copy first.
 * Camera and bridge requests are never touched.
 */
const CACHE = 'ptz-pad-v1';
const SHELL = [
  './',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/icon.svg',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const key = req.mode === 'navigate' ? './' : req;
  try {
    const res = await withTimeout(fetch(req, { cache: 'no-cache' }), 3000);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // Only the app's own files. Bridge endpoints, if this is served by the bridge, go straight through.
    const inScope = url.pathname.startsWith(new URL('./', self.registration.scope).pathname);
    const isApi = /\/(ping|visca|http|ndi)$/.test(url.pathname);
    if (inScope && !isApi) event.respondWith(networkFirst(req));
    return;
  }
  if (FONT_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(req));
});
