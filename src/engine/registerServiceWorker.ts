/**
 * R21/R22 — installable PWA + offline. Registers the cache-first service
 * worker (public/sw.js) so the app keeps working with zero network calls
 * once it has been loaded at least once while online. This module only
 * touches `navigator.serviceWorker`; it has no clock of any kind and no
 * bearing on R19's clock-separation wall.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Never block or degrade play if registration fails (e.g. unsupported
      // context) — offline install is additive, not load-bearing for R1-R20.
    });
  });
}

/**
 * Asks the service worker to cache the art slots the app actually uses.
 *
 * Needed because art is fetched by `<img>` from engine/assets.ts, not linked
 * from index.html, so the install-time precache (which scans index.html) never
 * sees it. Worse, on a first-ever visit the worker is still installing while
 * those images load, so it doesn't observe them as fetches either — without
 * this, real art only became available offline from the *second* visit onward.
 *
 * The list is derived from the loaded world rather than hand-maintained here,
 * so adding art to objects.yaml needs no matching edit in the worker. Slots
 * with no file are expected and harmless: the worker skips any response that
 * isn't an image, and requestAsset() falls back to its code-drawn placeholder
 * exactly as it does online.
 */
export function precacheArt(names: readonly string[]): void {
  if (!('serviceWorker' in navigator) || names.length === 0) return;
  const urls = names.map((n) => `/assets/${n}.svg`);
  navigator.serviceWorker.ready
    .then((reg) => {
      const target = reg.active ?? navigator.serviceWorker.controller;
      target?.postMessage({ type: 'precache-art', urls });
    })
    .catch(() => {
      // Same rule as registration: offline caching is additive and must never
      // affect play if it fails.
    });
}
