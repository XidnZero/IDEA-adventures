// R21/R22 — offline PWA shell. Cache-first with a background refresh, plus
// an explicit precache of everything index.html references, so a single
// online load is enough to make the app work fully offline afterward.
//
// This file only ever caches bytes already fetched over the network the app
// itself made (index.html, its built JS/CSS, the manifest, the placeholder
// icons). It does not add any new network call during play — world data is
// bundled into the JS at build time (see docs/decisions.md), so there is
// nothing else to fetch once the shell is cached.
const CACHE_NAME = 'idea-adventures-shell-v1';

async function precacheFromIndex(cache) {
  const res = await fetch('/index.html', { cache: 'no-store' });
  await cache.put('/index.html', res.clone());
  await cache.put('/', res.clone());

  const html = await res.text();
  const urls = new Set();
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1].startsWith('/')) urls.add(m[1]);
  }

  await Promise.all(
    [...urls].map((u) =>
      fetch(u)
        .then((r) => (r.ok ? cache.put(u, r) : null))
        .catch(() => {}),
    ),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => precacheFromIndex(cache))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Art-asset slots (public/assets/<name>.png, requested by
  // engine/assets.ts's requestAsset()) are deliberately allowed to be
  // missing — CLAUDE.md's placeholder-fallback pattern already handles that
  // silently per-layer/per-object, purely via the <img>'s error event, with
  // no dependency on HTTP status. Online, this is left to behave exactly as
  // it would with no service worker at all (real file present -> loads;
  // absent -> a normal 404, silently caught by requestAsset()'s onerror).
  // Offline with nothing cached (true today, since no real art exists yet),
  // a raw network failure would surface as a console-visible connection
  // error even though nothing is actually broken — so that specific case
  // gets a harmless 200 response that isn't valid image data, which still
  // fails to decode (still triggers the same onerror fallback) without
  // logging anything. NOTE: checks the .png extension, not just the
  // "/assets/" prefix — Vite's own built JS bundle also lives under
  // "/assets/" (e.g. /assets/index-<hash>.js) and must still be cached
  // normally.
  if (url.pathname.startsWith('/assets/') && url.pathname.endsWith('.png')) {
    event.respondWith(
      fetch(req).catch(() => new Response('', { status: 200, headers: { 'Content-Type': 'text/plain' } })),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Serve the cache instantly; refresh it in the background so a
        // later online reload picks up any change. Never lets a background
        // refresh failure affect what's returned to the page.
        fetch(req)
          .then((res) => {
            if (res && res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(req, res));
          })
          .catch(() => {});
        return cached;
      }
      // Not cached: try the network, but always resolve to a real Response
      // even when offline — e.g. the placeholder art slots this project
      // deliberately leaves unfilled (see CLAUDE.md's art-fallback pattern)
      // were never cached because they 404 even online, and offline they
      // must fail the same quiet way rather than surfacing as a raw network
      // error. `requestAsset()` already treats any failure identically.
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => new Response('', { status: 504, statusText: 'Offline' }));
    }),
  );
});
