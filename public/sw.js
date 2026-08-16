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

// Every cache read goes through this. `ignoreVary` is required, not a
// nicety: the dev/preview servers answer with `Vary: Origin`, and entries are
// stored from plain same-origin `fetch(url)` calls that send no `Origin`
// header — while `<script type="module">` is fetched in CORS mode and *does*
// send one. Default Vary-aware matching therefore treats the cached bundle as
// a miss and the app cannot boot offline at all. Everything cached here is a
// same-origin GET of a static file, so varying on Origin carries no meaning.
const MATCH_OPTS = { ignoreVary: true };

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

// Art slots live in public/assets/ and are fetched by <img> rather than linked
// from index.html, so precacheFromIndex() can't discover them, and on a
// first-ever visit this worker is still installing while they load — so it
// doesn't see them as fetches either. The page therefore posts the list it
// actually uses (derived from world data, see registerServiceWorker.ts) once
// the worker is ready. Responses that aren't images are skipped for the same
// reason as in the fetch handler: a missing file answers 200 with index.html.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'precache-art' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        data.urls.map((u) =>
          cache.match(u, MATCH_OPTS).then((hit) => {
            if (hit) return undefined;
            return fetch(u)
              .then((res) => {
                const type = res && res.headers ? res.headers.get('Content-Type') || '' : '';
                if (res && res.ok && type.startsWith('image/')) return cache.put(u, res);
                return undefined;
              })
              .catch(() => undefined);
          }),
        ),
      ),
    ),
  );
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

  // Art-asset slots (public/assets/<name>.svg|.png, requested by
  // engine/assets.ts's requestAsset()) are deliberately allowed to be
  // missing — CLAUDE.md's placeholder-fallback pattern already handles that
  // silently per-layer/per-object, purely via the <img>'s error event, with
  // no dependency on HTTP status. A slot that has no file is not an error;
  // requestAsset() just draws its code-drawn placeholder instead.
  //
  // Real art now exists for some of these slots, so they are cached like any
  // other asset once fetched successfully — otherwise the app would render
  // placeholders offline for objects that have real sprites. The order below
  // is therefore: cache, then network (caching a successful response), then
  // a harmless empty 200 only if both miss. That last step matters because a
  // raw service-worker-observed network failure is console-visible even when
  // nothing is broken, whereas an empty 200 fails to decode as an image and
  // so triggers exactly the same requestAsset() onerror fallback silently.
  //
  // NOTE: checks the extension, not just the "/assets/" prefix — Vite's own
  // built JS bundle also lives under "/assets/" (e.g.
  // /assets/index-<hash>.js) and must still go through the normal path.
  if (url.pathname.startsWith('/assets/') && /\.(svg|png)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req, MATCH_OPTS).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            // `res.ok` is NOT sufficient to decide this is real art: both the
            // Vite dev server and `vite preview` answer a missing file with a
            // 200 serving index.html itself, so caching on status alone would
            // store a copy of the HTML shell under every empty art slot and
            // pin a stale shell at those URLs forever. Only cache a response
            // that actually claims to be an image; anything else is passed
            // through uncached and fails to decode, which is precisely the
            // signal requestAsset()'s onerror fallback already expects.
            const type = res && res.headers ? res.headers.get('Content-Type') || '' : '';
            if (res && res.ok && type.startsWith('image/')) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => new Response('', { status: 200, headers: { 'Content-Type': 'text/plain' } }));
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(req, MATCH_OPTS).then((cached) => {
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
